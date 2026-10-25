import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'add_card_screen.dart';
import 'card_service.dart';

/// Saved cards (spec §3.2): a wallet-style list with add and remove.
class CardsScreen extends StatefulWidget {
  const CardsScreen({super.key});

  @override
  State<CardsScreen> createState() => _CardsScreenState();
}

class _CardsScreenState extends State<CardsScreen> {
  late Future<List<SavedCard>> _cards;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _cards = CardService.instance.list();
    });
  }

  Future<void> _addCard() async {
    final added = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const AddCardScreen()),
    );
    if (added == true) _reload();
  }

  Future<void> _remove(SavedCard c) async {
    await CardService.instance.remove(c.id);
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Your cards')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addCard,
        icon: const Icon(Icons.add),
        label: const Text('Add card'),
      ),
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
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.credit_card_off_outlined, size: 64, color: xc.textMuted),
                    const SizedBox(height: XSpacing.lg),
                    Text('No cards yet',
                        style: XType.h3.copyWith(color: xc.textPrimary)),
                    const SizedBox(height: XSpacing.xs),
                    Text('Add a card to start paying.',
                        style: XType.body.copyWith(color: xc.textSecondary)),
                  ],
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(XSpacing.xl),
            itemCount: cards.length,
            separatorBuilder: (_, __) => const SizedBox(height: XSpacing.lg),
            itemBuilder: (context, i) {
              final c = cards[i];
              return Dismissible(
                key: ValueKey(c.id),
                direction: DismissDirection.endToStart,
                background: Container(
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: XSpacing.xl),
                  child: Icon(Icons.delete_outline, color: xc.error),
                ),
                onDismissed: (_) => _remove(c),
                child: XCard3D(
                  last4: c.last4,
                  network: c.networkEnum,
                  issuerName: c.issuer ?? '',
                  expiry: c.expiry,
                ),
              );
            },
          );
        },
      ),
    );
  }
}
