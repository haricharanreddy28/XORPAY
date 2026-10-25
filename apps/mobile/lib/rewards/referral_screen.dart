import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'rewards_service.dart';

/// Refer & earn (spec §3.6): share your code, and redeem a friend's code.
class ReferralScreen extends StatefulWidget {
  const ReferralScreen({super.key});

  @override
  State<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends State<ReferralScreen> {
  late Future<Referral> _referral;
  final _codeInput = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _referral = RewardsService.instance.getReferral();
  }

  @override
  void dispose() {
    _codeInput.dispose();
    super.dispose();
  }

  Future<void> _redeem() async {
    final code = _codeInput.text.trim().toUpperCase();
    if (code.isEmpty || _busy) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final coins = await RewardsService.instance.redeem(code);
      messenger.showSnackBar(SnackBar(content: Text('You earned $coins coins!')));
      setState(() {
        _referral = RewardsService.instance.getReferral();
      });
      _codeInput.clear();
    } catch (_) {
      messenger.showSnackBar(
          const SnackBar(content: Text('Couldn’t redeem that code.')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Refer & earn')),
      body: FutureBuilder<Referral>(
        future: _referral,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final r = snap.data;
          return ListView(
            padding: const EdgeInsets.all(XSpacing.xl),
            children: [
              if (r != null) ...[
                Text(
                  'Invite friends — you both get ${r.rewardCoins} coins when they join.',
                  style: XType.body.copyWith(color: xc.textSecondary),
                ),
                const SizedBox(height: XSpacing.lg),
                _CodeCard(code: r.code),
                const SizedBox(height: XSpacing.md),
                Text('${r.referralsCount} friend(s) joined with your code.',
                    style: XType.caption.copyWith(color: xc.textMuted)),
              ],
              const SizedBox(height: XSpacing.xxxl),
              if (r?.referredBy == null) ...[
                Text('Have a code?',
                    style: XType.h3.copyWith(color: xc.textPrimary)),
                const SizedBox(height: XSpacing.md),
                TextField(
                  controller: _codeInput,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: [
                    TextInputFormatter.withFunction(
                        (_, n) => n.copyWith(text: n.text.toUpperCase())),
                  ],
                  decoration: const InputDecoration(labelText: 'Referral code'),
                ),
                const SizedBox(height: XSpacing.md),
                XButton(label: 'Apply code', loading: _busy, onPressed: _redeem),
              ] else
                Text('You joined with a referral code — thanks!',
                    style: XType.body.copyWith(color: xc.textSecondary)),
            ],
          );
        },
      ),
    );
  }
}

class _CodeCard extends StatelessWidget {
  const _CodeCard({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Container(
      padding: const EdgeInsets.all(XSpacing.xl),
      decoration: BoxDecoration(
        gradient: xc.gradient,
        borderRadius: BorderRadius.circular(XRadius.card),
        boxShadow: [BoxShadow(color: xc.glow, blurRadius: 24, offset: const Offset(0, 10))],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your code',
                    style: XType.overline.copyWith(
                        color: Colors.white.withValues(alpha: 0.8))),
                const SizedBox(height: 4),
                Text(code,
                    style: XType.h2.copyWith(
                        color: Colors.white, letterSpacing: 2)),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.copy_rounded, color: Colors.white),
            onPressed: () {
              Clipboard.setData(ClipboardData(
                  text: 'Join XORPAY with my code $code and we both earn coins!'));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Invite copied')),
              );
            },
          ),
        ],
      ),
    );
  }
}
