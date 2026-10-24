import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../cards/card_service.dart';
import 'pay_target.dart';
import 'payment_flow_screen.dart';

/// Credit-card bill payment — the no-BBPS approach (see README / cost note):
/// instead of a BBPS biller, the user picks a saved card and pays a manual
/// amount, routed through the existing payout rail. Bill *fetch* (amount due)
/// needs a biller aggregator and can be added later without changing this UI.
class CardBillPayScreen extends StatefulWidget {
  const CardBillPayScreen({super.key});

  @override
  State<CardBillPayScreen> createState() => _CardBillPayScreenState();
}

class _CardBillPayScreenState extends State<CardBillPayScreen> {
  late Future<List<SavedCard>> _cards;

  @override
  void initState() {
    super.initState();
    _cards = CardService.instance.list();
  }

  void _pay(SavedCard c) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PaymentFlowScreen(
        target: PayTarget.biller(
          displayName: '${c.issuer ?? 'Card'} bill',
          category: 'card_bill',
          maskedAccount: '•• ${c.last4}',
          reference: c.id,
        ),
        title: 'Card bill',
        purpose: 'Credit-card bill •• ${c.last4}',
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Card bill pay')),
      body: FutureBuilder<List<SavedCard>>(
        future: _cards,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final cards = snap.data ?? [];
          if (cards.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(XSpacing.xxxl),
                child: Text('Add a card first, then pay its bill.',
                    style: XType.body.copyWith(color: xc.textSecondary)),
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.all(XSpacing.xl),
            children: [
              Text('Choose a card to pay',
                  style: XType.overline.copyWith(color: xc.textMuted)),
              const SizedBox(height: XSpacing.md),
              for (final c in cards) ...[
                GestureDetector(
                  onTap: () => _pay(c),
                  child: XCard3D(
                    last4: c.last4,
                    network: c.networkEnum,
                    issuerName: c.issuer ?? '',
                    expiry: c.expiry,
                  ),
                ),
                const SizedBox(height: XSpacing.lg),
              ],
            ],
          );
        },
      ),
    );
  }
}
