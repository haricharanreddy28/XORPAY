import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'transaction_detail_screen.dart';
import 'transaction_service.dart';

/// Transaction history (spec §3.5): list with status chips, tap for detail.
class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  late Future<List<Txn>> _txns;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() => setState(() {
        _txns = TransactionService.instance.list();
      });

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Transactions')),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: FutureBuilder<List<Txn>>(
          future: _txns,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            final txns = snap.data ?? [];
            if (txns.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 120),
                  Icon(Icons.receipt_long_outlined, size: 64, color: xc.textMuted),
                  const SizedBox(height: XSpacing.lg),
                  Center(
                    child: Text('No transactions yet',
                        style: XType.h3.copyWith(color: xc.textPrimary)),
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: XSpacing.sm),
              itemCount: txns.length,
              separatorBuilder: (_, __) => Divider(color: xc.border, height: 1),
              itemBuilder: (context, i) => _TxnRow(
                txn: txns[i],
                onTap: () async {
                  await Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => TransactionDetailScreen(id: txns[i].id),
                  ));
                  _reload();
                },
              ),
            );
          },
        ),
      ),
    );
  }
}

class _TxnRow extends StatelessWidget {
  const _TxnRow({required this.txn, required this.onTap});
  final Txn txn;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
            horizontal: XSpacing.xl, vertical: XSpacing.md),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _title(txn.category),
                    style: XType.body.copyWith(
                        color: xc.textPrimary, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(_date(txn.createdAt),
                      style: XType.caption.copyWith(color: xc.textMuted)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(XMoney.fromMinor(txn.payeeMinor),
                    style: XType.body.copyWith(
                        color: xc.textPrimary, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                StatusChip(txn: txn),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _title(String? category) => switch (category) {
        'vendor' => 'Vendor payment',
        'rent' => 'Rent',
        null => 'Payment',
        _ => '${category[0].toUpperCase()}${category.substring(1)}',
      };

  static String _date(DateTime d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ap = d.hour < 12 ? 'am' : 'pm';
    return '${d.day} ${months[d.month - 1]}, $h:${d.minute.toString().padLeft(2, '0')}$ap';
  }
}

/// Colour-coded status chip shared by the list and detail screens.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.txn});
  final Txn txn;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final (label, color) = txn.isSuccess
        ? ('Success', xc.success)
        : txn.isFailed
            ? (txn.state == 'REFUNDED' ? 'Refunded' : 'Failed', xc.error)
            : ('Pending', xc.warning);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(XRadius.pill),
      ),
      child: Text(label, style: XType.overline.copyWith(color: color)),
    );
  }
}
