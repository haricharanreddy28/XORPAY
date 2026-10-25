import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../payments/transaction_service.dart';
import 'account_service.dart';

/// Statements (spec §3.5): transactions over a date range. The backend can
/// also return CSV (?format=csv) for email/download.
class StatementsScreen extends StatefulWidget {
  const StatementsScreen({super.key});

  @override
  State<StatementsScreen> createState() => _StatementsScreenState();
}

class _StatementsScreenState extends State<StatementsScreen> {
  DateTime _from = DateTime.now().subtract(const Duration(days: 30));
  DateTime _to = DateTime.now();
  Future<List<Txn>>? _rows;

  @override
  void initState() {
    super.initState();
    _run();
  }

  void _run() {
    setState(() {
      _rows = AccountService.instance.statements(from: _from, to: _to);
    });
  }

  Future<void> _pick(bool isFrom) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isFrom ? _from : _to,
      firstDate: DateTime(2023),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => isFrom ? _from = picked : _to = picked);
      _run();
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Statements')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(XSpacing.xl),
            child: Row(
              children: [
                Expanded(child: _DateChip(label: 'From', date: _from, onTap: () => _pick(true))),
                const SizedBox(width: XSpacing.md),
                Expanded(child: _DateChip(label: 'To', date: _to, onTap: () => _pick(false))),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Txn>>(
              future: _rows,
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                final rows = snap.data ?? const [];
                if (rows.isEmpty) {
                  return Center(
                    child: Text('No transactions in this range.',
                        style: XType.body.copyWith(color: xc.textSecondary)),
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: XSpacing.xl),
                  itemCount: rows.length,
                  separatorBuilder: (_, __) => Divider(color: xc.border, height: 1),
                  itemBuilder: (context, i) {
                    final t = rows[i];
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: XSpacing.sm),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(t.category ?? 'Payment',
                              style: XType.body.copyWith(color: xc.textPrimary)),
                          Text(XMoney.fromMinor(t.payeeMinor),
                              style: XType.body.copyWith(
                                  color: xc.textPrimary, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DateChip extends StatelessWidget {
  const _DateChip({required this.label, required this.date, required this.onTap});
  final String label;
  final DateTime date;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(XRadius.input),
      child: Container(
        padding: const EdgeInsets.all(XSpacing.md),
        decoration: BoxDecoration(
          color: xc.bgSurface,
          borderRadius: BorderRadius.circular(XRadius.input),
          border: Border.all(color: xc.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: XType.overline.copyWith(color: xc.textMuted)),
            Text('${date.day}/${date.month}/${date.year}',
                style: XType.body.copyWith(color: xc.textPrimary)),
          ],
        ),
      ),
    );
  }
}
