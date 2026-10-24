import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../receipts/receipt.dart';
import 'pay_target.dart';
import 'payment_service.dart';

/// Shared checkout for every category (spec §3.4 common flow):
/// AmountPad → fee breakdown sheet → Cashfree checkout → status → receipt.
class PaymentFlowScreen extends StatefulWidget {
  const PaymentFlowScreen({
    super.key,
    required this.target,
    this.title,
    this.purpose,
  });

  final PayTarget target;
  final String? title;
  final String? purpose;

  @override
  State<PaymentFlowScreen> createState() => _PaymentFlowScreenState();
}

class _PaymentFlowScreenState extends State<PaymentFlowScreen> {
  int _amount = 0; // payee amount in rupees
  FeeBreakdown _breakdown = XFee.compute(0);
  bool _busy = false;

  Future<void> _review() async {
    if (_amount <= 0) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.xc.bgElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(XRadius.sheet)),
      ),
      builder: (sheetCtx) => FeeBreakdownSheet(
        breakdown: _breakdown,
        payeeName: widget.target.displayName,
        coins: (_amount ~/ 100).clamp(0, 500),
        onConfirm: () {
          Navigator.of(sheetCtx).pop();
          _pay();
        },
      ),
    );
  }

  Future<void> _pay() async {
    setState(() => _busy = true);
    try {
      final target = widget.target;
      final order = await PaymentService.instance.createOrder(
        amountMinor: _amount * 100,
        category: target.category,
        beneficiaryId: target.beneficiaryId,
        beneficiaryVerified: target.verified,
        metadata: {'purpose': widget.purpose, 'reference': target.reference},
      );
      final result = await PaymentService.instance.payWithOrder(order);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => ReceiptScreen(
          result: result,
          order: order,
          payeeName: target.displayName,
          category: target.category,
          payeeAmount: _amount.toDouble(),
        ),
      ));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payment couldn’t be started.')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title ?? 'Pay')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(XSpacing.xl),
              child: PayeeTile(
                name: widget.target.displayName,
                maskedAccount: widget.target.maskedAccount,
                verified: widget.target.verified,
              ),
            ),
            const Spacer(),
            AmountPad(
              onChanged: (amount, breakdown) => setState(() {
                _amount = amount;
                _breakdown = breakdown;
              }),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.all(XSpacing.xl),
              child: XButton(
                label: _amount > 0
                    ? 'Review ${XMoney.format(_breakdown.youPay)}'
                    : 'Enter amount',
                loading: _busy,
                onPressed: (_amount > 0 && !_busy) ? _review : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
