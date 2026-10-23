import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../beneficiaries/beneficiary_service.dart';
import '../receipts/receipt.dart';
import 'payment_service.dart';

/// Shared checkout for vendor/rent/etc (spec §3.4 common flow):
/// AmountPad → fee breakdown sheet → Cashfree checkout → status → receipt.
class PaymentFlowScreen extends StatefulWidget {
  const PaymentFlowScreen({
    super.key,
    required this.payee,
    required this.category,
    this.title,
    this.purpose,
  });

  final Beneficiary payee;
  final String category; // 'vendor' | 'rent' | ...
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
        payeeName: widget.payee.displayName,
        coins: (_amount ~/ 100).clamp(0, 500), // 1 coin / ₹100, illustrative
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
      final order = await PaymentService.instance.createOrder(
        amountMinor: _amount * 100,
        category: widget.category,
        beneficiaryId: widget.payee.id,
        beneficiaryVerified: widget.payee.verified,
        metadata: {'purpose': widget.purpose},
      );
      final result = await PaymentService.instance.payWithOrder(order);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => ReceiptScreen(
          result: result,
          order: order,
          payee: widget.payee,
          category: widget.category,
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
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title ?? 'Pay')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(XSpacing.xl),
              child: PayeeTile(
                name: widget.payee.displayName,
                maskedAccount: widget.payee.maskedAccount,
                verified: widget.payee.verified,
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
                label: _amount > 0 ? 'Review ${XMoney.format(_breakdown.youPay)}' : 'Enter amount',
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
