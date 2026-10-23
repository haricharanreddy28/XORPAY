import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

/// Splash (spec §7.7): the X assembles from two crossing rounded bars on a
/// dark gradient, then the wordmark fades in. Calls [onDone] when finished.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  );

  late final Animation<double> _assemble = CurvedAnimation(
    parent: _c,
    curve: const Interval(0.0, 0.55, curve: Curves.easeOutBack),
  );
  late final Animation<double> _wordmark = CurvedAnimation(
    parent: _c,
    curve: const Interval(0.55, 1.0, curve: Curves.easeOut),
  );

  @override
  void initState() {
    super.initState();
    _c.forward();
    _c.addStatusListener((s) {
      if (s == AnimationStatus.completed) {
        Future.delayed(const Duration(milliseconds: 400), () {
          if (mounted) widget.onDone();
        });
      }
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Splash always uses the dark hero palette.
    const xc = XColors.dark;
    return Scaffold(
      backgroundColor: xc.bgBase,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [xc.bgBase, const Color(0xFF1A1230), xc.bgBase],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedBuilder(
                animation: _assemble,
                builder: (context, _) => SizedBox(
                  width: 96,
                  height: 96,
                  child: CustomPaint(
                    painter: _XLogoPainter(
                      t: _assemble.value,
                      colors: xc.brandGradient,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: XSpacing.xl),
              FadeTransition(
                opacity: _wordmark,
                child: ShaderMask(
                  shaderCallback: (r) =>
                      LinearGradient(colors: xc.brandGradient).createShader(r),
                  child: Text(
                    'XORPAY',
                    style: XType.h1.copyWith(
                      color: Colors.white,
                      letterSpacing: 4,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Draws the X as two crossing rounded bars with a cut-out overlap — the bars
/// slide/rotate into place as [t] goes 0→1.
class _XLogoPainter extends CustomPainter {
  _XLogoPainter({required this.t, required this.colors});
  final double t;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final paint = Paint()
      ..shader = LinearGradient(colors: colors).createShader(
        Rect.fromCenter(center: center, width: size.width, height: size.height),
      )
      ..style = PaintingStyle.fill;

    final barLen = size.width * 0.9 * t;
    final barThick = size.width * 0.22;
    final offset = (1 - t) * size.width * 0.5;

    for (final (i, angle) in [math.pi / 4, -math.pi / 4].indexed) {
      canvas.save();
      canvas.translate(center.dx, center.dy);
      canvas.rotate(angle);
      // Bars slide in from opposite sides as they assemble.
      canvas.translate(i == 0 ? -offset : offset, 0);
      final rect = RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset.zero,
          width: barLen,
          height: barThick,
        ),
        Radius.circular(barThick / 2),
      );
      canvas.drawRRect(rect, paint);
      canvas.restore();
    }

    // Cut-out forward arrow at the overlap (money moving) — appears near the end.
    if (t > 0.8) {
      final clear = Paint()..blendMode = BlendMode.clear;
      final a = (t - 0.8) / 0.2;
      final s = barThick * 0.5 * a;
      final path = Path()
        ..moveTo(center.dx - s, center.dy - s)
        ..lineTo(center.dx + s, center.dy)
        ..lineTo(center.dx - s, center.dy + s)
        ..close();
      canvas.drawPath(path, clear);
    }
  }

  @override
  bool shouldRepaint(_XLogoPainter old) => old.t != t;
}
