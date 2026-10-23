import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/x_spacing.dart';
import '../theme/x_theme.dart';

/// Primary XORPAY button (spec §7.5):
///  - gradient fill, 56px tall, purple glow shadow
///  - press: scale 0.97 + light haptic
///  - loading: a shimmer sweep across the gradient
///  - disabled: flat `border` colour, no glow
///
/// One gradient button per screen; use [XButton.secondary] for the rest.
class XButton extends StatefulWidget {
  const XButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
  }) : _secondary = false;

  const XButton.secondary({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
  }) : _secondary = true;

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final bool _secondary;

  @override
  State<XButton> createState() => _XButtonState();
}

class _XButtonState extends State<XButton> with SingleTickerProviderStateMixin {
  late final AnimationController _shimmer = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );
  bool _pressed = false;

  @override
  void initState() {
    super.initState();
    if (widget.loading) _shimmer.repeat();
  }

  @override
  void didUpdateWidget(XButton old) {
    super.didUpdateWidget(old);
    if (widget.loading && !_shimmer.isAnimating) {
      _shimmer.repeat();
    } else if (!widget.loading && _shimmer.isAnimating) {
      _shimmer.stop();
    }
  }

  @override
  void dispose() {
    _shimmer.dispose();
    super.dispose();
  }

  bool get _enabled => widget.onPressed != null && !widget.loading;

  void _onTap() {
    if (!_enabled) return;
    HapticFeedback.lightImpact();
    widget.onPressed!();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final content = _Content(
      label: widget.label,
      icon: widget.icon,
      loading: widget.loading,
      color: widget._secondary ? xc.textPrimary : Colors.white,
    );

    final child = widget._secondary
        ? Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: xc.bgSurface,
              borderRadius: BorderRadius.circular(XRadius.button),
              border: Border.all(color: xc.border),
            ),
            child: content,
          )
        : _GradientBody(shimmer: _shimmer, enabled: _enabled, child: content);

    return Semantics(
      button: true,
      enabled: _enabled,
      label: widget.label,
      child: GestureDetector(
        onTapDown: _enabled ? (_) => setState(() => _pressed = true) : null,
        onTapUp: _enabled ? (_) => setState(() => _pressed = false) : null,
        onTapCancel: _enabled ? () => setState(() => _pressed = false) : null,
        onTap: _onTap,
        child: AnimatedScale(
          scale: _pressed ? 0.97 : 1,
          duration: const Duration(milliseconds: 90),
          child: SizedBox(height: 56, child: child),
        ),
      ),
    );
  }
}

class _GradientBody extends StatelessWidget {
  const _GradientBody({
    required this.shimmer,
    required this.enabled,
    required this.child,
  });

  final AnimationController shimmer;
  final bool enabled;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    if (!enabled) {
      return Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: xc.border,
          borderRadius: BorderRadius.circular(XRadius.button),
        ),
        child: child,
      );
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: xc.gradient,
        borderRadius: BorderRadius.circular(XRadius.button),
        boxShadow: [
          BoxShadow(color: xc.glow, blurRadius: 24, offset: const Offset(0, 8)),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(XRadius.button),
        child: AnimatedBuilder(
          animation: shimmer,
          builder: (context, c) {
            return Stack(
              alignment: Alignment.center,
              children: [
                if (shimmer.isAnimating)
                  Positioned.fill(
                    child: _ShimmerSweep(progress: shimmer.value),
                  ),
                c!,
              ],
            );
          },
          child: child,
        ),
      ),
    );
  }
}

/// A soft white highlight sweeping left→right for the loading state.
class _ShimmerSweep extends StatelessWidget {
  const _ShimmerSweep({required this.progress});
  final double progress;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment(-1 + progress * 2 - 0.3, 0),
          end: Alignment(-1 + progress * 2 + 0.3, 0),
          colors: const [
            Color(0x00FFFFFF),
            Color(0x40FFFFFF),
            Color(0x00FFFFFF),
          ],
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({
    required this.label,
    required this.icon,
    required this.loading,
    required this.color,
  });

  final String label;
  final IconData? icon;
  final bool loading;
  final Color color;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return SizedBox(
        height: 22,
        width: 22,
        child: CircularProgressIndicator(strokeWidth: 2.4, color: color),
      );
    }
    final text = Text(
      label,
      style: Theme.of(context)
          .textTheme
          .titleLarge
          ?.copyWith(color: color, fontWeight: FontWeight.w600),
    );
    if (icon == null) return text;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: XSpacing.sm),
        text,
      ],
    );
  }
}
