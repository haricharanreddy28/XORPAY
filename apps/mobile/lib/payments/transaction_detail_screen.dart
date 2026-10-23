import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'transactions_screen.dart' show StatusChip;
import 'transaction_service.dart';

/// Transaction detail (spec §3.5): big amount, a status timeline derived from
/// the server state, the amount breakdown, reference and UTR.
class TransactionDetailScreen extends StatefulWidget {
  const TransactionDetailScreen({super.key, required this.id});
  final String id;

  @override
  State<TransactionDetailScreen> createState() => _TransactionDetailScreenState();
}

class _TransactionDetailScreenState extends State<TransactionDetailScreen> {
  late Future<Txn> _txn;

  @override
  void initState() {
    super.initState();
    _txn = TransactionService.instance.get(widget.id);
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction')),
      body: FutureBuilder<Txn>(
        future: _txn,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError || !snap.hasData) {
            return Center(
              child: Text('Couldn’t load this transaction.',
                  style: XType.body.copyWith(color: xc.textSecondary)),
            );
          }
          final t = snap.data!;
          return ListView(
            padding: const EdgeInsets.all(XSpacing.xl),
            children: [
              Center(
                child: Column(
                  children: [
                    Text(XMoney.fromMinor(t.payeeMinor),
                        style: XType.amount(40).copyWith(color: xc.textPrimary)),
                    const SizedBox(height: XSpacing.sm),
                    StatusChip(txn: t),
                  ],
                ),
              ),
              const SizedBox(height: XSpacing.xxl),
              StatusTimeline(steps: _timeline(t), utr: t.utr),
              const SizedBox(height: XSpacing.lg),
              _Breakdown(txn: t),
              if (t.failureReason != null) ...[
                const SizedBox(height: XSpacing.md),
                Text('Reason: ${t.failureReason}',
                    style: XType.caption.copyWith(color: xc.error)),
              ],
            ],
          );
        },
      ),
    );
  }

  List<TimelineStep> _timeline(Txn t) {
    // Order of progress; map the server state onto the three visible steps.
    const paidStates = {
      'PAID', 'PAYOUT_QUEUED', 'PAYOUT_PROCESSING', 'SUCCESS',
      'REFUND_INITIATED', 'REFUNDED',
    };
    final paid = paidStates.contains(t.state);
    final processing =
        t.state == 'PAYOUT_QUEUED' || t.state == 'PAYOUT_PROCESSING';

    if (t.isFailed) {
      return [
        TimelineStep('Paid', done: paid, sub: 'Collected from your card'),
        const TimelineStep('Payout failed', done: true),
        TimelineStep(
          t.state == 'REFUNDED' ? 'Refunded to source' : 'Refund in progress',
          active: t.state != 'REFUNDED',
          done: t.state == 'REFUNDED',
        ),
      ];
    }
    return [
      TimelineStep('Paid', done: paid, sub: 'Collected from your card'),
      TimelineStep('Processing payout', done: t.isSuccess, active: processing),
      TimelineStep('Credited', done: t.isSuccess, active: false),
    ];
  }
}

class _Breakdown extends StatelessWidget {
  const _Breakdown({required this.txn});
  final Txn txn;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    Widget row(String k, String v) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(k, style: XType.caption.copyWith(color: xc.textSecondary)),
              Flexible(
                child: Text(v,
                    textAlign: TextAlign.right,
                    style: XType.caption.copyWith(color: xc.textPrimary)),
              ),
            ],
          ),
        );
    return Container(
      padding: const EdgeInsets.all(XSpacing.lg),
      decoration: BoxDecoration(
        color: xc.bgSurface,
        borderRadius: BorderRadius.circular(XRadius.card),
        border: Border.all(color: xc.border),
      ),
      child: Column(
        children: [
          row('They get', XMoney.fromMinor(txn.payeeMinor)),
          row('Fee', XMoney.fromMinor(txn.feeMinor)),
          row('GST on fee', XMoney.fromMinor(txn.gstMinor)),
          row('You paid', XMoney.fromMinor(txn.youPayMinor)),
          row('Reference', txn.id),
        ],
      ),
    );
  }
}
