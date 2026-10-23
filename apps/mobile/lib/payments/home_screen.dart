import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../auth/session.dart';
import '../beneficiaries/beneficiaries_screen.dart';
import '../business/business_profile_screen.dart';
import '../cards/cards_screen.dart';
import '../limits/limits_service.dart';
import 'payment_service.dart';
import 'payment_status_screen.dart';
import 'qr_scan_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Future<Limits>? _limits;

  @override
  void initState() {
    super.initState();
    _limits = LimitsService.instance.fetch();
  }

  void _refreshLimits() {
    setState(() => _limits = LimitsService.instance.fetch());
  }

  Future<void> _openBusinessProfile() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const BusinessProfileScreen()),
    );
    if (changed == true) _refreshLimits(); // GST tier may have raised limits
  }

  void _openCards() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const CardsScreen()),
    );
  }

  void _openPayees() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const BeneficiariesScreen()),
    );
  }

  Future<void> _scanAndPay() async {
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QrScanScreen()),
    );
    if (raw == null || !mounted) return;

    final upi = UpiPayload.tryParse(raw);
    final messenger = ScaffoldMessenger.of(context);
    if (upi?.payeeVpa == null) {
      messenger.showSnackBar(const SnackBar(content: Text('Not a valid UPI QR')));
      return;
    }

    // Demo amount: ₹1 = 100 paise. Real flow collects the amount via AmountPad.
    const amountMinor = 100;

    // Early limits check so we fail fast with a clear message.
    final check = await LimitsService.instance.check(amountMinor);
    if (!check.allowed) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(check.message)));
      return;
    }

    final order = await PaymentService.instance.createOrder(
      amountMinor: amountMinor,
      metadata: {'payee': upi!.payeeVpa},
    );
    final result = await PaymentService.instance.payWithOrder(order);

    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => PaymentStatusScreen(result: result)),
    );
    _refreshLimits();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(
        title: const Text('XORPAY'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<Session>().logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _refreshLimits(),
        child: ListView(
          padding: const EdgeInsets.all(XSpacing.xl),
          children: [
            _LimitsCard(future: _limits),
            const SizedBox(height: XSpacing.xl),
            XButton(
              label: 'Scan & Pay',
              icon: Icons.qr_code_scanner,
              onPressed: _scanAndPay,
            ),
            const SizedBox(height: XSpacing.md),
            XButton.secondary(
              label: 'Payees',
              icon: Icons.group_outlined,
              onPressed: _openPayees,
            ),
            const SizedBox(height: XSpacing.md),
            XButton.secondary(
              label: 'Cards',
              icon: Icons.credit_card,
              onPressed: _openCards,
            ),
            const SizedBox(height: XSpacing.md),
            XButton.secondary(
              label: 'Add GST details',
              icon: Icons.business_center_outlined,
              onPressed: _openBusinessProfile,
            ),
            const SizedBox(height: XSpacing.md),
            XButton.secondary(
              label: 'Transactions',
              icon: Icons.history,
              onPressed: () {},
            ),
          ],
        ),
      ),
    );
  }
}

/// Hero "Available to pay" card driven by GET /limits.
class _LimitsCard extends StatelessWidget {
  const _LimitsCard({required this.future});
  final Future<Limits>? future;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Container(
      padding: const EdgeInsets.all(XSpacing.xl),
      decoration: BoxDecoration(
        gradient: xc.gradient,
        borderRadius: BorderRadius.circular(XRadius.card),
        boxShadow: [BoxShadow(color: xc.glow, blurRadius: 28, offset: const Offset(0, 12))],
      ),
      child: FutureBuilder<Limits>(
        future: future,
        builder: (context, snap) {
          final onGrad = Colors.white;
          if (snap.connectionState == ConnectionState.waiting) {
            return const SizedBox(
              height: 72,
              child: Center(child: CircularProgressIndicator(color: Colors.white)),
            );
          }
          if (snap.hasError || !snap.hasData) {
            return SizedBox(
              height: 72,
              child: Center(
                child: Text('Couldn’t load limits. Pull to refresh.',
                    style: XType.caption.copyWith(color: onGrad)),
              ),
            );
          }
          final l = snap.data!;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Available to pay today',
                      style: XType.caption.copyWith(color: onGrad.withValues(alpha: 0.85))),
                  _TierChip(label: l.tierLabel),
                ],
              ),
              const SizedBox(height: XSpacing.sm),
              Text(
                XMoney.fromMinor(l.remainingDailyMinor),
                style: XType.amount(36).copyWith(color: onGrad),
              ),
              const SizedBox(height: XSpacing.xs),
              Text(
                l.canPay
                    ? 'Per payment up to ${XMoney.fromMinor(l.perTxnMinor)}'
                    : 'Complete KYC to start paying',
                style: XType.caption.copyWith(color: onGrad.withValues(alpha: 0.85)),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _TierChip extends StatelessWidget {
  const _TierChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(XRadius.pill),
      ),
      child: Text(label,
          style: XType.overline.copyWith(color: Colors.white)),
    );
  }
}
