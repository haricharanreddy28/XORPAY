import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/x_spacing.dart';
import '../theme/x_theme.dart';
import '../theme/x_type.dart';
import '../util/x_fee.dart';
import '../util/x_money.dart';

/// Amount entry (spec §7.5): auto-scaling Sora amount, custom numeric keypad,
/// quick chips, and a live "They get · Fee · You pay" breakdown line.
///
/// Whole rupees only (no paise entry), which matches how these payments are
/// entered. [onChanged] fires with the current amount and its [FeeBreakdown].
class AmountPad extends StatefulWidget {
  const AmountPad({
    super.key,
    this.initialAmount = 0,
    this.onChanged,
    this.feeRatePct = 2.0,
    this.gstOnFeePct = 18.0,
    this.quickChips = const [5000, 10000, 25000, 50000],
    this.maxAmount = 1000000,
  });

  final int initialAmount;
  final void Function(int amount, FeeBreakdown breakdown)? onChanged;
  final double feeRatePct;
  final double gstOnFeePct;
  final List<int> quickChips;
  final int maxAmount;

  @override
  State<AmountPad> createState() => _AmountPadState();
}

class _AmountPadState extends State<AmountPad> {
  late int _amount = widget.initialAmount;

  void _setAmount(int next) {
    final clamped = next.clamp(0, widget.maxAmount);
    if (clamped == _amount) return;
    setState(() => _amount = clamped);
    HapticFeedback.selectionClick();
    widget.onChanged?.call(_amount, _breakdown);
  }

  FeeBreakdown get _breakdown => XFee.compute(
        _amount.toDouble(),
        feeRatePct: widget.feeRatePct,
        gstOnFeePct: widget.gstOnFeePct,
      );

  void _tapDigit(int d) => _setAmount(_amount * 10 + d);
  void _tapDoubleZero() => _setAmount(_amount * 100);
  void _backspace() => _setAmount(_amount ~/ 10);

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final b = _breakdown;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Amount display — auto-scales down as digits grow.
        SizedBox(
          height: 72,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              XMoney.format(_amount, decimals: 0),
              style: XType.amount(56).copyWith(color: xc.textPrimary),
            ),
          ),
        ),
        const SizedBox(height: XSpacing.sm),

        // Live breakdown line.
        Text.rich(
          TextSpan(
            style: XType.caption.copyWith(color: xc.textSecondary),
            children: [
              TextSpan(text: 'They get ${XMoney.format(b.payeeGets)}'),
              TextSpan(text: '  ·  ', style: TextStyle(color: xc.textMuted)),
              TextSpan(text: 'Fee ${XMoney.format(b.totalCharge)}'),
              TextSpan(text: '  ·  ', style: TextStyle(color: xc.textMuted)),
              TextSpan(
                text: 'You pay ${XMoney.format(b.youPay)}',
                style: TextStyle(color: xc.textPrimary, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: XSpacing.lg),

        // Quick chips.
        Wrap(
          spacing: XSpacing.sm,
          alignment: WrapAlignment.center,
          children: [
            for (final chip in widget.quickChips)
              _Chip(
                label: _chipLabel(chip),
                onTap: () => _setAmount(chip),
              ),
          ],
        ),
        const SizedBox(height: XSpacing.lg),

        _Keypad(
          onDigit: _tapDigit,
          onDoubleZero: _tapDoubleZero,
          onBackspace: _backspace,
        ),
      ],
    );
  }

  static String _chipLabel(int v) {
    if (v >= 100000 && v % 100000 == 0) return '₹${v ~/ 100000}L';
    if (v >= 1000 && v % 1000 == 0) return '₹${v ~/ 1000}K';
    return XMoney.format(v, decimals: 0);
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(XRadius.pill),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: xc.bgSurface,
          borderRadius: BorderRadius.circular(XRadius.pill),
          border: Border.all(color: xc.border),
        ),
        child: Text(label, style: XType.caption.copyWith(color: xc.textPrimary)),
      ),
    );
  }
}

class _Keypad extends StatelessWidget {
  const _Keypad({
    required this.onDigit,
    required this.onDoubleZero,
    required this.onBackspace,
  });

  final void Function(int) onDigit;
  final VoidCallback onDoubleZero;
  final VoidCallback onBackspace;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final keys = <Widget>[
      for (var n = 1; n <= 9; n++) _key(context, '$n', () => onDigit(n)),
      _key(context, '00', onDoubleZero),
      _key(context, '0', () => onDigit(0)),
      _KeyButton(
        onTap: onBackspace,
        child: Icon(Icons.backspace_outlined, color: xc.textPrimary, size: 22),
      ),
    ];
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.9,
      mainAxisSpacing: XSpacing.sm,
      crossAxisSpacing: XSpacing.sm,
      children: keys,
    );
  }

  Widget _key(BuildContext context, String label, VoidCallback onTap) {
    return _KeyButton(
      onTap: onTap,
      child: Text(label, style: XType.h2.copyWith(color: context.xc.textPrimary)),
    );
  }
}

class _KeyButton extends StatelessWidget {
  const _KeyButton({required this.child, required this.onTap});
  final Widget child;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      borderRadius: BorderRadius.circular(XRadius.input),
      child: Center(child: child),
    );
  }
}
