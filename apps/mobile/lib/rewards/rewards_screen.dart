import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'referral_screen.dart';
import 'rewards_service.dart';

/// Rewards (spec §3.6, §7.11): a gold coin balance and the earn history.
class RewardsScreen extends StatefulWidget {
  const RewardsScreen({super.key});

  @override
  State<RewardsScreen> createState() => _RewardsScreenState();
}

class _RewardsScreenState extends State<RewardsScreen> {
  late Future<Rewards> _rewards;

  @override
  void initState() {
    super.initState();
    _rewards = RewardsService.instance.getRewards();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Rewards')),
      body: FutureBuilder<Rewards>(
        future: _rewards,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final r = snap.data ?? const Rewards(balance: 0, history: []);
          return ListView(
            padding: const EdgeInsets.all(XSpacing.xl),
            children: [
              _CoinCard(balance: r.balance),
              const SizedBox(height: XSpacing.lg),
              XButton(
                label: 'Refer & earn',
                icon: Icons.card_giftcard,
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ReferralScreen()),
                ),
              ),
              const SizedBox(height: XSpacing.xxl),
              Text('Earn history',
                  style: XType.h3.copyWith(color: xc.textPrimary)),
              const SizedBox(height: XSpacing.sm),
              if (r.history.isEmpty)
                Text('No rewards yet — pay a bill to earn coins.',
                    style: XType.body.copyWith(color: xc.textSecondary))
              else
                for (final e in r.history) _HistoryRow(entry: e),
            ],
          );
        },
      ),
    );
  }
}

class _CoinCard extends StatelessWidget {
  const _CoinCard({required this.balance});
  final int balance;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Container(
      padding: const EdgeInsets.all(XSpacing.xxl),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: xc.rewardGold),
        borderRadius: BorderRadius.circular(XRadius.card),
      ),
      child: Column(
        children: [
          // Original coin mark: a dark disc with a rupee glyph.
          Container(
            width: 56,
            height: 56,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: Color(0xFF14121F),
              shape: BoxShape.circle,
            ),
            child: Text('₹',
                style: XType.h2.copyWith(
                    color: const Color(0xFFFFD95A), fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: XSpacing.md),
          Text('$balance',
              style: XType.amount(48).copyWith(color: const Color(0xFF14121F))),
          Text('coins',
              style: XType.body.copyWith(
                  color: const Color(0xFF14121F), fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.entry});
  final RewardEntry entry;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: XSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(entry.label,
                    style: XType.body.copyWith(
                        color: xc.textPrimary, fontWeight: FontWeight.w600)),
                Text(_date(entry.at),
                    style: XType.caption.copyWith(color: xc.textMuted)),
              ],
            ),
          ),
          ShaderMask(
            shaderCallback: (b) =>
                LinearGradient(colors: xc.rewardGold).createShader(b),
            child: Text('+${entry.coins}',
                style: XType.body.copyWith(
                    color: Colors.white, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  static String _date(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }
}
