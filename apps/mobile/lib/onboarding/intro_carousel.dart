import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

/// Intro carousel (spec §7.7): 3 slides, Skip at the top, gradient dots,
/// and "Get started" on the last slide. [onFinish] fires on Get started / Skip.
class IntroCarousel extends StatefulWidget {
  const IntroCarousel({super.key, required this.onFinish});
  final VoidCallback onFinish;

  @override
  State<IntroCarousel> createState() => _IntroCarouselState();
}

class _IntroCarouselState extends State<IntroCarousel> {
  final _controller = PageController();
  int _page = 0;

  static const _slides = [
    _Slide(
      icon: Icons.credit_card_rounded,
      title: 'Pay rent, vendors & GST with your card',
      body: 'Settle any business payment by card, UPI or net banking — even '
          'where cards aren’t normally accepted.',
    ),
    _Slide(
      icon: Icons.schedule_rounded,
      title: 'Get up to 45 days interest-free',
      body: 'Use your card’s billing cycle to free up working capital while '
          'your payee gets paid now.',
    ),
    _Slide(
      icon: Icons.savings_rounded,
      title: 'Earn coins on every payment',
      body: 'Cashback, scratch cards and rewards on the payments you already '
          'make for your business.',
    ),
  ];

  bool get _isLast => _page == _slides.length - 1;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_isLast) {
      widget.onFinish();
    } else {
      _controller.nextPage(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.all(XSpacing.sm),
                child: TextButton(
                  onPressed: widget.onFinish,
                  child: Text('Skip',
                      style: XType.body.copyWith(color: xc.textSecondary)),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (context, i) => _slides[i],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(XSpacing.xl),
              child: Column(
                children: [
                  _Dots(count: _slides.length, active: _page),
                  const SizedBox(height: XSpacing.xl),
                  XButton(
                    label: _isLast ? 'Get started' : 'Next',
                    onPressed: _next,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Slide extends StatelessWidget {
  const _Slide({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: XSpacing.xl),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 160,
            height: 160,
            decoration: BoxDecoration(
              gradient: xc.gradient,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(color: xc.glow, blurRadius: 40, spreadRadius: 4),
              ],
            ),
            child: Icon(icon, size: 72, color: Colors.white),
          ),
          const SizedBox(height: XSpacing.xxxl),
          Text(title,
              textAlign: TextAlign.center,
              style: XType.h1.copyWith(color: xc.textPrimary)),
          const SizedBox(height: XSpacing.md),
          Text(body,
              textAlign: TextAlign.center,
              style: XType.body.copyWith(color: xc.textSecondary)),
        ],
      ),
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.active});
  final int count;
  final int active;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 240),
            margin: const EdgeInsets.symmetric(horizontal: 4),
            width: i == active ? 24 : 8,
            height: 8,
            decoration: BoxDecoration(
              gradient: i == active ? xc.gradient : null,
              color: i == active ? null : xc.border,
              borderRadius: BorderRadius.circular(XRadius.pill),
            ),
          ),
      ],
    );
  }
}
