import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../auth/session.dart';
import '../beneficiaries/beneficiaries_screen.dart';
import '../business/business_profile_screen.dart';
import '../cards/cards_screen.dart';
import '../invoices/gst_hub_screen.dart';
import '../limits/limits_service.dart';
import '../notifications/notification_service.dart';
import '../notifications/notifications_screen.dart';
import '../settings/settings_screen.dart';
import '../support/support_screen.dart';
import '../rewards/rewards_screen.dart';
import '../rewards/rewards_service.dart';
import 'biller_pay_screens.dart';
import 'card_bill_pay_screen.dart';
import 'rent_pay_screen.dart';
import 'transactions_screen.dart';
import 'vendor_pay_screen.dart';
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
  Future<Rewards>? _rewards;
  Future<NotificationFeed>? _feed;

  @override
  void initState() {
    super.initState();
    _limits = LimitsService.instance.fetch();
    _rewards = RewardsService.instance.getRewards();
    _feed = NotificationService.instance.list();
  }

  void _refreshLimits() {
    setState(() {
      _limits = LimitsService.instance.fetch();
    });
  }

  void _refreshHeader() {
    setState(() {
      _rewards = RewardsService.instance.getRewards();
      _feed = NotificationService.instance.list();
    });
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

  Future<void> _push(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    _refreshLimits(); // a completed payment consumes limit
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('XORPAY'),
        actions: [
          _CoinsChip(
            future: _rewards,
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const RewardsScreen()),
              );
              _refreshHeader();
            },
          ),
          _NotificationsBell(
            future: _feed,
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const NotificationsScreen()),
              );
              _refreshHeader();
            },
          ),
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
            CategoryGrid(items: [
              CategoryItem(
                  icon: Icons.store_outlined,
                  label: 'Vendor',
                  onTap: () => _push(const VendorPayScreen())),
              CategoryItem(
                  icon: Icons.home_outlined,
                  label: 'Rent',
                  onTap: () => _push(const RentPayScreen())),
              CategoryItem(
                  icon: Icons.receipt_long_outlined,
                  label: 'GST',
                  onTap: () => _push(const GstPayScreen())),
              CategoryItem(
                  icon: Icons.school_outlined,
                  label: 'Education',
                  onTap: () => _push(const EducationPayScreen())),
              CategoryItem(
                  icon: Icons.account_balance_outlined,
                  label: 'Taxes',
                  onTap: () => _push(const TaxPayScreen())),
              CategoryItem(
                  icon: Icons.credit_score_outlined,
                  label: 'Card bill',
                  onTap: () => _push(const CardBillPayScreen())),
              CategoryItem(
                  icon: Icons.inventory_2_outlined,
                  label: 'GST Hub',
                  onTap: () => _push(const GstHubScreen())),
              CategoryItem(
                  icon: Icons.qr_code_scanner,
                  label: 'Scan & Pay',
                  onTap: _scanAndPay),
              CategoryItem(
                  icon: Icons.group_outlined,
                  label: 'Payees',
                  onTap: _openPayees),
            ]),
            const SizedBox(height: XSpacing.xl),
            Row(
              children: [
                Expanded(
                  child: XButton.secondary(
                      label: 'Cards', icon: Icons.credit_card, onPressed: _openCards),
                ),
                const SizedBox(width: XSpacing.md),
                Expanded(
                  child: XButton.secondary(
                      label: 'History',
                      icon: Icons.history,
                      onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => const TransactionsScreen()),
                          )),
                ),
              ],
            ),
            const SizedBox(height: XSpacing.md),
            XButton.secondary(
              label: 'Add GST details',
              icon: Icons.business_center_outlined,
              onPressed: _openBusinessProfile,
            ),
            const SizedBox(height: XSpacing.md),
            Row(
              children: [
                Expanded(
                  child: XButton.secondary(
                    label: 'Support',
                    icon: Icons.support_agent,
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const SupportScreen()),
                    ),
                  ),
                ),
                const SizedBox(width: XSpacing.md),
                Expanded(
                  child: XButton.secondary(
                    label: 'Settings',
                    icon: Icons.settings_outlined,
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const SettingsScreen()),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Coins balance chip in the app bar.
class _CoinsChip extends StatelessWidget {
  const _CoinsChip({required this.future, required this.onTap});
  final Future<Rewards>? future;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return FutureBuilder<Rewards>(
      future: future,
      builder: (context, snap) {
        final coins = snap.data?.balance ?? 0;
        return InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(XRadius.pill),
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 10),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: xc.rewardGold),
              borderRadius: BorderRadius.circular(XRadius.pill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.monetization_on, size: 16, color: Color(0xFF14121F)),
                const SizedBox(width: 4),
                Text('$coins',
                    style: XType.caption.copyWith(
                        color: const Color(0xFF14121F), fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Notifications bell with an unread dot.
class _NotificationsBell extends StatelessWidget {
  const _NotificationsBell({required this.future, required this.onTap});
  final Future<NotificationFeed>? future;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return FutureBuilder<NotificationFeed>(
      future: future,
      builder: (context, snap) {
        final unread = snap.data?.unread ?? 0;
        return Stack(
          alignment: Alignment.center,
          children: [
            IconButton(icon: const Icon(Icons.notifications_none), onPressed: onTap),
            if (unread > 0)
              Positioned(
                right: 10,
                top: 10,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(color: xc.error, shape: BoxShape.circle),
                ),
              ),
          ],
        );
      },
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
          const onGrad = Colors.white;
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
