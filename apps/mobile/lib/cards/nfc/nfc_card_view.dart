import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:nfc_manager/nfc_manager.dart';
import 'package:nfc_manager/nfc_manager_android.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'track2_parser.dart';

/// Reads a contactless card over NFC and extracts the PAN + expiry from the
/// EMV Track-2 Equivalent Data (tag 57), then hands them to the add-card form.
///
/// LIMITATIONS: Android-only (iOS restricts EMV contactless reads); not all
/// cards expose Track-2 without cryptographic authentication. Best-effort —
/// validate on real devices/cards. The PAN stays on-device and goes only to
/// the tokeniser, never to our backend.
class NfcCardView extends StatefulWidget {
  const NfcCardView({super.key, required this.onExtracted});
  final void Function(String? number, String? expiry) onExtracted;

  @override
  State<NfcCardView> createState() => _NfcCardViewState();
}

class _NfcCardViewState extends State<NfcCardView> {
  String _status = 'Tap your card to the back of the phone.';
  bool _scanning = false;

  // EMV APDUs.
  static final _selectPpse = Uint8List.fromList([
    0x00, 0xA4, 0x04, 0x00, 0x0E, //
    0x32, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53, //
    0x2E, 0x44, 0x44, 0x46, 0x30, 0x31, 0x00, // "2PAY.SYS.DDF01"
  ]);
  static final _gpo =
      Uint8List.fromList([0x80, 0xA8, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]);

  static String _hex(Uint8List b) =>
      b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

  Future<void> _scan() async {
    // ignore: deprecated_member_use
    final available = await NfcManager.instance.isAvailable();
    if (!available) {
      setState(() => _status = 'NFC is off or unavailable on this device.');
      return;
    }
    setState(() {
      _scanning = true;
      _status = 'Hold the card still…';
    });

    NfcManager.instance.startSession(
      pollingOptions: {NfcPollingOption.iso14443},
      onDiscovered: (tag) async {
        try {
          final iso = IsoDepAndroid.from(tag);
          if (iso == null) {
            await _finish('This card can’t be read here (Android only).');
            return;
          }

          final blob = StringBuffer();
          Future<void> send(Uint8List apdu) async {
            final res = await iso.transceive(apdu);
            blob.write(_hex(res));
          }

          // PPSE -> AID -> GPO -> read a few records, scanning for tag 57.
          final ppse = await iso.transceive(_selectPpse);
          blob.write(_hex(ppse));
          final aid = extractEmvTag(_hex(ppse), '4f');
          if (aid != null) {
            final bytes = <int>[];
            for (var i = 0; i < aid.length; i += 2) {
              bytes.add(int.parse(aid.substring(i, i + 2), radix: 16));
            }
            await send(Uint8List.fromList(
              [0x00, 0xA4, 0x04, 0x00, bytes.length, ...bytes, 0x00],
            ));
          }
          await send(_gpo);
          for (var sfi = 1; sfi <= 3; sfi++) {
            for (var rec = 1; rec <= 4; rec++) {
              try {
                await send(Uint8List.fromList(
                  [0x00, 0xB2, rec, (sfi << 3) | 4, 0x00],
                ));
              } catch (_) {/* record absent — keep going */}
            }
          }

          final t57 = extractEmvTag(blob.toString(), '57');
          final card = t57 != null ? parseTrack2Hex(t57) : const EmvTrack2();
          if (card.pan != null) {
            widget.onExtracted(card.pan, card.expiry);
            await _finish('Card read.');
          } else {
            await _finish('Couldn’t read card details. Try manual entry.');
          }
        } catch (_) {
          await _finish('NFC read failed. Please try again.');
        }
      },
    );
  }

  Future<void> _finish(String message) async {
    try {
      await NfcManager.instance.stopSession();
    } catch (_) {/* ignore */}
    if (mounted) {
      setState(() {
        _scanning = false;
        _status = message;
      });
    }
  }

  @override
  void dispose() {
    if (_scanning) NfcManager.instance.stopSession();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(XSpacing.xxxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.nfc_rounded, size: 72, color: xc.primary),
            const SizedBox(height: XSpacing.lg),
            Text(_status,
                textAlign: TextAlign.center,
                style: XType.body.copyWith(color: xc.textSecondary)),
            const SizedBox(height: XSpacing.xl),
            XButton(
              label: _scanning ? 'Scanning…' : 'Scan card',
              loading: _scanning,
              onPressed: _scanning ? null : _scan,
            ),
          ],
        ),
      ),
    );
  }
}
