import 'package:flutter/material.dart';

import '../theme/x_colors.dart';
import '../theme/x_spacing.dart';
import '../theme/x_theme.dart';
import '../theme/x_type.dart';
import '../util/x_fee.dart';
import '../util/x_money.dart';
import 'x_button.dart';

/// Transparent fee breakdown before paying (spec §7.5): amount, platform fee,
/// 18% GST on the fee, total, who gets credited, settlement time, and coins.
/// Drop into a bottom sheet; calls [onConfirm] on the pay button.
class FeeBreakdownSheet extends StatelessWidget {
  const FeeBreakdownSheet({
    super.key,
    required this.breakdown,
    required this.payeeName,
    required this.onConfirm,
    this.settlement = 'Credited within 2 hours',
    this.coins = 0,
    this.busy = false,
  });

  final FeeBreakdown breakdown;
  final String payeeName;
  final VoidCallback onConfirm;
  final String settlement;
  final int coins;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
            XSpacing.xl, XSpacing.md, XSpacing.xl, XSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: XSpacing.lg),
                decoration: BoxDecoration(
                  color: xc.border,
                  borderRadius: BorderRadius.circular(XRadius.pill),
                ),
              ),
            ),
            Text('Confirm payment', style: XType.h2.copyWith(color: xc.textPrimary)),
            const SizedBox(height: XSpacing.lg),
            _row(xc, 'They get', XMoney.format(breakdown.payeeGets)),
            _row(xc, 'Platform fee', XMoney.format(breakdown.fee)),
            _row(xc, 'GST (18% on fee)', XMoney.format(breakdown.gst)),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: XSpacing.sm),
              child: Divider(color: xc.border, height: 1),
            ),
            _row(xc, 'You pay', XMoney.format(breakdown.youPay), emphasize: true),
            const SizedBox(height: XSpacing.sm),
            _row(xc, 'Credited to', payeeName, muted: true),
            _row(xc, 'Settlement', settlement, muted: true),
            if (coins > 0) ...[
              const SizedBox(height: XSpacing.sm),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Coins you’ll earn',
                      style: XType.caption.copyWith(color: xc.textSecondary)),
                  ShaderMask(
                    shaderCallback: (r) =>
                        LinearGradient(colors: xc.rewardGold).createShader(r),
                    child: Text('+$coins',
                        style: XType.body.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ],
            const SizedBox(height: XSpacing.xl),
            XButton(
              label: 'Pay ${XMoney.format(breakdown.youPay)}',
              loading: busy,
              onPressed: onConfirm,
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(XColors xc, String label, String value,
      {bool emphasize = false, bool muted = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: XType.body.copyWith(
                  color: muted ? xc.textMuted : xc.textSecondary)),
          Text(
            value,
            style: (emphasize ? XType.h3 : XType.body).copyWith(
              color: xc.textPrimary,
              fontWeight: emphasize ? FontWeight.w700 : FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
