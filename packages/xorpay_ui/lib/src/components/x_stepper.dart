import 'package:flutter/material.dart';

import '../theme/x_colors.dart';
import '../theme/x_type.dart';
import '../theme/x_theme.dart';

/// Horizontal progress stepper (spec §7.7): labelled nodes with a % done
/// readout. Completed nodes show a check, the active node glows, and the
/// connectors fill with the brand gradient as you advance.
class XStepper extends StatelessWidget {
  const XStepper({
    super.key,
    required this.steps,
    required this.currentIndex,
    this.showPercent = true,
  });

  /// Short labels, e.g. ['PAN', 'Aadhaar', 'Selfie', 'Done'].
  final List<String> steps;

  /// 0-based index of the active step. Steps before it are completed.
  final int currentIndex;
  final bool showPercent;

  int get _percent => steps.length <= 1
      ? 100
      : (currentIndex / (steps.length - 1) * 100).round().clamp(0, 100);

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showPercent)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              '$_percent% done',
              style: XType.overline.copyWith(color: xc.textMuted),
            ),
          ),
        Row(
          children: [
            for (var i = 0; i < steps.length; i++)
              Expanded(
                child: _StepItem(
                  label: steps[i],
                  index: i,
                  isFirst: i == 0,
                  isLast: i == steps.length - 1,
                  completed: i < currentIndex,
                  active: i == currentIndex,
                  leftFilled: currentIndex >= i,
                  rightFilled: currentIndex >= i + 1,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _StepItem extends StatelessWidget {
  const _StepItem({
    required this.label,
    required this.index,
    required this.isFirst,
    required this.isLast,
    required this.completed,
    required this.active,
    required this.leftFilled,
    required this.rightFilled,
  });

  final String label;
  final int index;
  final bool isFirst;
  final bool isLast;
  final bool completed;
  final bool active;
  final bool leftFilled;
  final bool rightFilled;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final reached = completed || active;

    return Column(
      children: [
        SizedBox(
          height: 32,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Row(
                children: [
                  Expanded(child: _connector(xc, filled: leftFilled, hidden: isFirst)),
                  const SizedBox(width: 32),
                  Expanded(child: _connector(xc, filled: rightFilled, hidden: isLast)),
                ],
              ),
              _node(xc),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: XType.overline.copyWith(
            color: reached ? xc.textPrimary : xc.textMuted,
          ),
        ),
      ],
    );
  }

  Widget _connector(XColors xc, {required bool filled, required bool hidden}) {
    if (hidden) return const SizedBox.shrink();
    return Container(
      height: 2,
      decoration: BoxDecoration(
        gradient: filled ? xc.gradient : null,
        color: filled ? null : xc.border,
      ),
    );
  }

  Widget _node(XColors xc) {
    final reached = completed || active;
    return Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: reached ? xc.gradient : null,
        color: reached ? null : xc.bgSurface,
        border: reached ? null : Border.all(color: xc.border),
        boxShadow: active
            ? [BoxShadow(color: xc.glow, blurRadius: 10, spreadRadius: 1)]
            : null,
      ),
      child: completed
          ? const Icon(Icons.check, size: 16, color: Colors.white)
          : Text(
              '${index + 1}',
              style: XType.overline.copyWith(
                color: active ? Colors.white : xc.textMuted,
                fontWeight: FontWeight.w700,
              ),
            ),
    );
  }
}
