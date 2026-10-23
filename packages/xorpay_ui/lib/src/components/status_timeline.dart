import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/x_spacing.dart';
import '../theme/x_theme.dart';
import '../theme/x_type.dart';

/// One step in a payment's progress.
class TimelineStep {
  const TimelineStep(this.label, {this.done = false, this.active = false, this.sub});
  final String label;
  final bool done;
  final bool active;
  final String? sub; // optional detail line, e.g. a timestamp
}

/// Vertical payment status timeline (spec §7.5): Paid → Processing → Credited,
/// with a check on completed steps and an optional UTR row with copy.
class StatusTimeline extends StatelessWidget {
  const StatusTimeline({super.key, required this.steps, this.utr});

  final List<TimelineStep> steps;
  final String? utr;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < steps.length; i++)
          _Row(step: steps[i], isLast: i == steps.length - 1),
        if (utr != null) ...[
          const SizedBox(height: XSpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: XSpacing.md, vertical: XSpacing.sm),
            decoration: BoxDecoration(
              color: xc.bgSurface,
              borderRadius: BorderRadius.circular(XRadius.input),
              border: Border.all(color: xc.border),
            ),
            child: Row(
              children: [
                Text('UTR  ', style: XType.caption.copyWith(color: xc.textMuted)),
                Expanded(
                  child: Text(utr!,
                      style: XType.caption.copyWith(color: xc.textPrimary)),
                ),
                InkWell(
                  onTap: () => Clipboard.setData(ClipboardData(text: utr!)),
                  child: Icon(Icons.copy_rounded, size: 16, color: xc.primary),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.step, required this.isLast});
  final TimelineStep step;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final reached = step.done || step.active;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: reached ? xc.gradient : null,
                  color: reached ? null : xc.bgSurface,
                  border: reached ? null : Border.all(color: xc.border),
                ),
                child: step.done
                    ? const Icon(Icons.check, size: 13, color: Colors.white)
                    : step.active
                        ? const _Pulse()
                        : null,
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                    color: step.done ? xc.primary : xc.border,
                  ),
                ),
            ],
          ),
          const SizedBox(width: XSpacing.md),
          Padding(
            padding: const EdgeInsets.only(bottom: XSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  step.label,
                  style: XType.body.copyWith(
                    color: reached ? xc.textPrimary : xc.textMuted,
                    fontWeight: step.active ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
                if (step.sub != null)
                  Text(step.sub!,
                      style: XType.caption.copyWith(color: xc.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Pulse extends StatelessWidget {
  const _Pulse();
  @override
  Widget build(BuildContext context) => Container(
        width: 8,
        height: 8,
        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
      );
}
