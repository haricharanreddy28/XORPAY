import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'card_service.dart';
import 'card_tokenizer.dart';
import 'nfc/nfc_card_view.dart';
import 'scan/scan_card_view.dart';

/// Add-card (spec §3.2, §7.7): Manual, Scan (OCR) and Tap (NFC). Scan and NFC
/// prefill the manual form, where the user confirms and taps Add.
///
/// Compliance: the PAN + CVV live only on-device; they are tokenised via
/// [CardTokenizer] and ONLY the token is sent to the backend.
class AddCardScreen extends StatefulWidget {
  const AddCardScreen({super.key, this.tokenizer});
  final CardTokenizer? tokenizer;

  @override
  State<AddCardScreen> createState() => _AddCardScreenState();
}

class _AddCardScreenState extends State<AddCardScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 3, vsync: this);
  late final CardTokenizer _tokenizer = widget.tokenizer ?? StubCardTokenizer();

  final _number = TextEditingController();
  final _expiry = TextEditingController();
  final _cvv = TextEditingController();
  final _name = TextEditingController();

  bool _busy = false;
  String? _error;

  String get _digits => _number.text.replaceAll(RegExp(r'\D'), '');
  CardNetwork get _network => detectCardNetwork(_digits);
  int get _cvvLen => _network == CardNetwork.amex ? 4 : 3;

  ({int m, int y})? _parseExpiry() {
    final m = RegExp(r'^(\d{2})/(\d{2})$').firstMatch(_expiry.text);
    if (m == null) return null;
    final mm = int.parse(m.group(1)!);
    if (mm < 1 || mm > 12) return null;
    return (m: mm, y: 2000 + int.parse(m.group(2)!));
  }

  bool get _valid =>
      _digits.length >= 13 &&
      _digits.length <= 19 &&
      _parseExpiry() != null &&
      _cvv.text.length == _cvvLen;

  /// Called by Scan/NFC with detected values; prefills + jumps to Manual.
  void _prefill(String? number, String? expiry) {
    setState(() {
      if (number != null) {
        final d = number.replaceAll(RegExp(r'\D'), '');
        final buf = StringBuffer();
        for (var i = 0; i < d.length; i++) {
          if (i != 0 && i % 4 == 0) buf.write(' ');
          buf.write(d[i]);
        }
        _number.text = buf.toString();
      }
      if (expiry != null) _expiry.text = expiry;
      _error = null;
    });
    _tab.animateTo(0);
  }

  Future<void> _save() async {
    final exp = _parseExpiry();
    if (exp == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final token = await _tokenizer.tokenize(CardDetails(
        number: _digits,
        expiryMonth: exp.m,
        expiryYear: exp.y,
        cvv: _cvv.text,
        holderName: _name.text.trim().isEmpty ? null : _name.text.trim(),
      ));
      await CardService.instance.add(token);
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      setState(() => _error = 'Couldn’t add this card. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _tab.dispose();
    _number.dispose();
    _expiry.dispose();
    _cvv.dispose();
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add card'),
        bottom: TabBar(controller: _tab, tabs: const [
          Tab(text: 'Manual'),
          Tab(text: 'Scan'),
          Tab(text: 'Tap'),
        ]),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _manualTab(context),
          ScanCardView(onExtracted: _prefill),
          NfcCardView(onExtracted: _prefill),
        ],
      ),
    );
  }

  Widget _manualTab(BuildContext context) {
    final xc = context.xc;
    final exp = _parseExpiry();
    final last4 =
        _digits.length >= 4 ? _digits.substring(_digits.length - 4) : '––––';

    return ListView(
      padding: const EdgeInsets.all(XSpacing.xl),
      children: [
        XCard3D(
          last4: last4,
          network: _network,
          holderName: _name.text,
          expiry: exp != null
              ? '${exp.m.toString().padLeft(2, '0')}/${exp.y % 100}'
              : null,
          tilt: false,
        ),
        const SizedBox(height: XSpacing.xxl),
        TextField(
          controller: _number,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(19),
            _CardNumberFormatter(),
          ],
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Card number'),
        ),
        const SizedBox(height: XSpacing.md),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _expiry,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(4),
                  _ExpiryFormatter(),
                ],
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(labelText: 'MM/YY'),
              ),
            ),
            const SizedBox(width: XSpacing.md),
            Expanded(
              child: TextField(
                controller: _cvv,
                keyboardType: TextInputType.number,
                obscureText: true,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(_cvvLen),
                ],
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(labelText: 'CVV'),
              ),
            ),
          ],
        ),
        const SizedBox(height: XSpacing.md),
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.characters,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Name on card (optional)'),
        ),
        if (_error != null) ...[
          const SizedBox(height: XSpacing.md),
          Text(_error!, style: XType.caption.copyWith(color: xc.error)),
        ],
        const SizedBox(height: XSpacing.md),
        Text(
          '🔒 Your card details are tokenised by our payment partner. '
          'XORPAY never stores your card number or CVV.',
          style: XType.caption.copyWith(color: xc.textMuted),
        ),
        const SizedBox(height: XSpacing.xl),
        XButton(
          label: 'Add card',
          loading: _busy,
          onPressed: (_valid && !_busy) ? _save : null,
        ),
      ],
    );
  }
}

/// Groups the card number into blocks of 4 as the user types.
class _CardNumberFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue _, TextEditingValue n) {
    final digits = n.text.replaceAll(RegExp(r'\D'), '');
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i != 0 && i % 4 == 0) buf.write(' ');
      buf.write(digits[i]);
    }
    final text = buf.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Inserts the slash in MM/YY.
class _ExpiryFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue _, TextEditingValue n) {
    final d = n.text.replaceAll(RegExp(r'\D'), '');
    final text = d.length <= 2 ? d : '${d.substring(0, 2)}/${d.substring(2)}';
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
