import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../beneficiaries/add_beneficiary_screen.dart';
import '../beneficiaries/beneficiary_service.dart';
import 'pay_target.dart';
import 'payment_flow_screen.dart';

/// Vendor/supplier payment (spec §3.4.1): pick a payee, then the shared flow.
class VendorPayScreen extends StatefulWidget {
  const VendorPayScreen({super.key});

  @override
  State<VendorPayScreen> createState() => _VendorPayScreenState();
}

class _VendorPayScreenState extends State<VendorPayScreen> {
  late Future<List<Beneficiary>> _payees;

  @override
  void initState() {
    super.initState();
    _payees = BeneficiaryService.instance.list();
  }

  void _pay(Beneficiary b) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PaymentFlowScreen(
        target: PayTarget.payee(b, category: 'vendor'),
        title: 'Pay vendor',
        purpose: 'Vendor payment',
      ),
    ));
  }

  Future<void> _addPayee() async {
    final added = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const AddBeneficiaryScreen()),
    );
    if (added == true) {
      setState(() {
        _payees = BeneficiaryService.instance.list();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Pay vendor')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addPayee,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('New payee'),
      ),
      body: FutureBuilder<List<Beneficiary>>(
        future: _payees,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final payees = snap.data ?? [];
          if (payees.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(XSpacing.xxxl),
                child: Text('Add a vendor to pay.',
                    style: XType.body.copyWith(color: xc.textSecondary)),
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.symmetric(vertical: XSpacing.sm),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    XSpacing.xl, XSpacing.md, XSpacing.xl, XSpacing.sm),
                child: Text('Choose a payee',
                    style: XType.overline.copyWith(color: xc.textMuted)),
              ),
              for (final b in payees)
                PayeeTile(
                  name: b.displayName,
                  maskedAccount: b.maskedAccount,
                  verified: b.verified,
                  onTap: () => _pay(b),
                ),
            ],
          );
        },
      ),
    );
  }
}
