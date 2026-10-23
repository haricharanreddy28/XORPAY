import 'package:flutter/material.dart';

import '../theme/x_spacing.dart';
import '../theme/x_theme.dart';
import '../theme/x_type.dart';
import '../util/x_money.dart';

/// A beneficiary row (spec §7.5): gradient-initials avatar, name with a
/// verified badge, masked account, and the last paid amount.
class PayeeTile extends StatelessWidget {
  const PayeeTile({
    super.key,
    required this.name,
    this.maskedAccount,
    this.verified = false,
    this.lastPaid,
    this.onTap,
  });

  final String name;

  /// e.g. "•• 4521" or a UPI id. Shown under the name.
  final String? maskedAccount;
  final bool verified;

  /// Last amount paid to this payee, in rupees. Shown on the trailing edge.
  final double? lastPaid;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(XRadius.card),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: XSpacing.card,
          vertical: XSpacing.md,
        ),
        child: Row(
          children: [
            _InitialsAvatar(name: name),
            const SizedBox(width: XSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: XType.body.copyWith(
                            color: xc.textPrimary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (verified) ...[
                        const SizedBox(width: 6),
                        Icon(Icons.verified, size: 16, color: xc.success),
                      ],
                    ],
                  ),
                  if (maskedAccount != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      maskedAccount!,
                      style: XType.caption.copyWith(color: xc.textMuted),
                    ),
                  ],
                ],
              ),
            ),
            if (lastPaid != null) ...[
              const SizedBox(width: XSpacing.sm),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    XMoney.format(lastPaid!),
                    style: XType.body.copyWith(
                      color: xc.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text('last paid',
                      style: XType.overline.copyWith(color: xc.textMuted)),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Avatar showing up to two initials over the brand gradient.
class _InitialsAvatar extends StatelessWidget {
  const _InitialsAvatar({required this.name});
  final String name;

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      final p = parts.first;
      return p.substring(0, p.length >= 2 ? 2 : 1).toUpperCase();
    }
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Container(
      width: 44,
      height: 44,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: xc.gradient,
        shape: BoxShape.circle,
      ),
      child: Text(
        _initials,
        style: XType.caption.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
