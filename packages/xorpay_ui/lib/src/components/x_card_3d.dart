import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';

import '../theme/x_spacing.dart';
import '../theme/x_type.dart';

/// Card networks shown as a plain text label — brand logos are trademarks and
/// are intentionally not drawn.
enum CardNetwork { visa, mastercard, rupay, amex, diners, other }

extension on CardNetwork {
  String get label => switch (this) {
        CardNetwork.visa => 'VISA',
        CardNetwork.mastercard => 'Mastercard',
        CardNetwork.rupay => 'RuPay',
        CardNetwork.amex => 'Amex',
        CardNetwork.diners => 'Diners',
        CardNetwork.other => '',
      };
}

/// A credit/debit card visual (spec §7.5): issuer gradient, chip, network
/// label and last 4 digits. Tilts up to ±6° with the gyroscope; if no sensor
/// is available (web, desktop, emulator) it simply stays flat.
class XCard3D extends StatefulWidget {
  const XCard3D({
    super.key,
    required this.last4,
    this.network = CardNetwork.other,
    this.issuerName = '',
    this.holderName,
    this.expiry,
    this.gradient = const [Color(0xFF2563EB), Color(0xFF6C2BD9)],
    this.tilt = true,
  });

  final String last4;
  final CardNetwork network;
  final String issuerName;
  final String? holderName;

  /// MM/YY.
  final String? expiry;

  /// Issuer gradient (two or more colours).
  final List<Color> gradient;

  /// Enable gyroscope tilt. Set false (or when Reduce Motion is on) for static.
  final bool tilt;

  @override
  State<XCard3D> createState() => _XCard3DState();
}

class _XCard3DState extends State<XCard3D> {
  static const _maxTilt = 6 * math.pi / 180; // ±6° in radians
  StreamSubscription? _sub;
  double _rotX = 0;
  double _rotY = 0;

  @override
  void initState() {
    super.initState();
    if (widget.tilt) _subscribe();
  }

  void _subscribe() {
    try {
      _sub = accelerometerEventStream().listen(
        (e) {
          // Map device tilt to small rotations; clamp to ±6°.
          final ry = (e.x / 9.8 * _maxTilt).clamp(-_maxTilt, _maxTilt);
          final rx = (e.y / 9.8 * _maxTilt).clamp(-_maxTilt, _maxTilt);
          if (!mounted) return;
          setState(() {
            _rotY = ry;
            _rotX = rx;
          });
        },
        onError: (_) {}, // no sensor → stay flat
        cancelOnError: true,
      );
    } catch (_) {
      // Platform without sensor support: static card.
    }
  }

  @override
  void didUpdateWidget(XCard3D old) {
    super.didUpdateWidget(old);
    if (widget.tilt && _sub == null) {
      _subscribe();
    } else if (!widget.tilt && _sub != null) {
      _sub!.cancel();
      _sub = null;
      setState(() => _rotX = _rotY = 0);
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final transform = Matrix4.identity()
      ..setEntry(3, 2, 0.0015) // perspective
      ..rotateX(_rotX)
      ..rotateY(_rotY);

    return AspectRatio(
      aspectRatio: 1.586, // ISO 7810 ID-1 card ratio
      child: Transform(
        alignment: Alignment.center,
        transform: transform,
        child: _CardFace(widget: widget),
      ),
    );
  }
}

class _CardFace extends StatelessWidget {
  const _CardFace({required this.widget});
  final XCard3D widget;

  @override
  Widget build(BuildContext context) {
    final grad = widget.gradient.length >= 2
        ? widget.gradient
        : [widget.gradient.first, widget.gradient.first];

    return Container(
      padding: const EdgeInsets.all(XSpacing.xl),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(XRadius.card),
        gradient: LinearGradient(
          colors: grad,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: grad.last.withValues(alpha: 0.45),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                widget.issuerName,
                style: XType.caption.copyWith(
                  color: Colors.white.withValues(alpha: 0.9),
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                widget.network.label,
                style: XType.h3.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: XSpacing.md),
          const _Chip(),
          const Spacer(),
          Text(
            '••••  ••••  ••••  ${widget.last4}',
            style: XType.h3.copyWith(
              color: Colors.white,
              letterSpacing: 2,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: XSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                (widget.holderName ?? '').toUpperCase(),
                style: XType.caption.copyWith(
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
              if (widget.expiry != null)
                Text(
                  widget.expiry!,
                  style: XType.caption.copyWith(
                    color: Colors.white.withValues(alpha: 0.9),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A small gold EMV-style chip (generic, not a brand mark).
class _Chip extends StatelessWidget {
  const _Chip();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 32,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        gradient: const LinearGradient(
          colors: [Color(0xFFF5B700), Color(0xFFFFD95A)],
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: List.generate(
          3,
          (_) => Container(height: 1, color: const Color(0x33000000)),
        ),
      ),
    );
  }
}
