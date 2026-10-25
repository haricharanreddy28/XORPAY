import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../beneficiaries/add_beneficiary_screen.dart';
import '../beneficiaries/beneficiary_service.dart';
import 'pay_target.dart';
import 'payment_flow_screen.dart';

/// Rent payment (spec §3.4.2): pick rent type + landlord (a beneficiary), then
/// the shared flow. Landlord PAN is required above the monthly threshold —
/// surfaced here as a note; enforcement lands with the rent backend module.
class RentPayScreen extends StatefulWidget {
  const RentPayScreen({super.key});

  @override
  State<RentPayScreen> createState() => _RentPayScreenState();
}

enum _RentType { house, shop, office }

extension on _RentType {
  String get label => switch (this) {
        _RentType.house => 'House',
        _RentType.shop => 'Shop',
        _RentType.office => 'Office',
      };
}

class _RentPayScreenState extends State<RentPayScreen> {
  _RentType _type = _RentType.house;
  Beneficiary? _landlord;
  late Future<List<Beneficiary>> _payees;

  @override
  void initState() {
    super.initState();
    _payees = BeneficiaryService.instance.list();
  }

  Future<void> _pickLandlord() async {
    final list = await _payees;
    if (!mounted) return;
    final chosen = await showModalBottomSheet<Beneficiary>(
      context: context,
      backgroundColor: context.xc.bgElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(XRadius.sheet)),
      ),
      builder: (ctx) => SafeArea(
        child: list.isEmpty
            ? Padding(
                padding: const EdgeInsets.all(XSpacing.xxl),
                child: XButton(
                  label: 'Add landlord',
                  onPressed: () async {
                    Navigator.of(ctx).pop();
                    final added = await Navigator.of(context).push<bool>(
                      MaterialPageRoute(builder: (_) => const AddBeneficiaryScreen()),
                    );
                    if (added == true) {
                      setState(() {
                        _payees = BeneficiaryService.instance.list();
                      });
                    }
                  },
                ),
              )
            : ListView(
                shrinkWrap: true,
                children: [
                  for (final b in list)
                    PayeeTile(
                      name: b.displayName,
                      maskedAccount: b.maskedAccount,
                      verified: b.verified,
                      onTap: () => Navigator.of(ctx).pop(b),
                    ),
                ],
              ),
      ),
    );
    if (chosen != null) setState(() => _landlord = chosen);
  }

  void _continue() {
    final landlord = _landlord;
    if (landlord == null) return;
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PaymentFlowScreen(
        target: PayTarget.payee(landlord, category: 'rent'),
        title: '${_type.label} rent',
        purpose: '${_type.label} rent',
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Pay rent')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(XSpacing.xl),
          children: [
            Text('Rent type', style: XType.h3.copyWith(color: xc.textPrimary)),
            const SizedBox(height: XSpacing.md),
            SegmentedButton<_RentType>(
              segments: [
                for (final t in _RentType.values)
                  ButtonSegment(value: t, label: Text(t.label)),
              ],
              selected: {_type},
              onSelectionChanged: (s) => setState(() => _type = s.first),
            ),
            const SizedBox(height: XSpacing.xxl),
            Text('Landlord', style: XType.h3.copyWith(color: xc.textPrimary)),
            const SizedBox(height: XSpacing.md),
            InkWell(
              onTap: _pickLandlord,
              borderRadius: BorderRadius.circular(XRadius.card),
              child: Container(
                padding: const EdgeInsets.all(XSpacing.lg),
                decoration: BoxDecoration(
                  color: xc.bgSurface,
                  borderRadius: BorderRadius.circular(XRadius.card),
                  border: Border.all(color: xc.border),
                ),
                child: _landlord == null
                    ? Row(children: [
                        Icon(Icons.add, color: xc.primary),
                        const SizedBox(width: XSpacing.sm),
                        Text('Choose landlord',
                            style: XType.body.copyWith(color: xc.textPrimary)),
                      ])
                    : Row(children: [
                        Icon(Icons.home_rounded, color: xc.primary),
                        const SizedBox(width: XSpacing.sm),
                        Expanded(
                          child: Text(_landlord!.displayName,
                              style: XType.body.copyWith(color: xc.textPrimary)),
                        ),
                        if (_landlord!.verified)
                          Icon(Icons.verified, size: 16, color: xc.success),
                      ]),
              ),
            ),
            const SizedBox(height: XSpacing.md),
            Text(
              'Note: landlord PAN is required for rent above ₹50,000/month.',
              style: XType.caption.copyWith(color: xc.textMuted),
            ),
            const SizedBox(height: XSpacing.xxl),
            XButton(
              label: 'Continue',
              onPressed: _landlord != null ? _continue : null,
            ),
          ],
        ),
      ),
    );
  }
}
