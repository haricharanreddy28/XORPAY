import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'add_beneficiary_screen.dart';
import 'beneficiary_service.dart';

/// Payee list (spec §3.3): each row is a PayeeTile with verified badge and
/// masked handle. Add via the FAB, remove by swipe.
class BeneficiariesScreen extends StatefulWidget {
  const BeneficiariesScreen({super.key});

  @override
  State<BeneficiariesScreen> createState() => _BeneficiariesScreenState();
}

class _BeneficiariesScreenState extends State<BeneficiariesScreen> {
  late Future<List<Beneficiary>> _payees;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _payees = BeneficiaryService.instance.list();
    });
  }

  Future<void> _add() async {
    final added = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const AddBeneficiaryScreen()),
    );
    if (added == true) _reload();
  }

  Future<void> _remove(Beneficiary b) async {
    await BeneficiaryService.instance.remove(b.id);
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Payees')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('Add payee'),
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
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.group_outlined, size: 64, color: xc.textMuted),
                    const SizedBox(height: XSpacing.lg),
                    Text('No payees yet',
                        style: XType.h3.copyWith(color: xc.textPrimary)),
                    const SizedBox(height: XSpacing.xs),
                    Text('Add a bank account or UPI ID to pay.',
                        style: XType.body.copyWith(color: xc.textSecondary)),
                  ],
                ),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: XSpacing.sm),
            itemCount: payees.length,
            itemBuilder: (context, i) {
              final b = payees[i];
              return Dismissible(
                key: ValueKey(b.id),
                direction: DismissDirection.endToStart,
                background: Container(
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: XSpacing.xl),
                  child: Icon(Icons.delete_outline, color: xc.error),
                ),
                onDismissed: (_) => _remove(b),
                child: PayeeTile(
                  name: b.displayName,
                  maskedAccount: b.type == 'upi'
                      ? b.maskedAccount
                      : '${b.ifsc ?? ''} · ${b.maskedAccount ?? ''}',
                  verified: b.verified,
                  onTap: () {},
                ),
              );
            },
          );
        },
      ),
    );
  }
}
