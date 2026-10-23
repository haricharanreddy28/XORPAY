import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../kyc/kyc_service.dart';

/// Business profile + GSTIN capture (spec §2 step 4, §3.7). Verifying a GSTIN
/// unlocks the GST tier (higher limits, lower fee). Pops `true` when the GSTIN
/// is verified so the caller can refresh limits.
class BusinessProfileScreen extends StatefulWidget {
  const BusinessProfileScreen({super.key});

  @override
  State<BusinessProfileScreen> createState() => _BusinessProfileScreenState();
}

enum _EntityType { individual, proprietor, pvtLtd, llp, partnership, other }

extension on _EntityType {
  String get label => switch (this) {
        _EntityType.individual => 'Individual',
        _EntityType.proprietor => 'Proprietor',
        _EntityType.pvtLtd => 'Private Limited',
        _EntityType.llp => 'LLP',
        _EntityType.partnership => 'Partnership',
        _EntityType.other => 'Other',
      };
}

class _BusinessProfileScreenState extends State<BusinessProfileScreen> {
  final _gstin = TextEditingController();
  // GSTIN: 2-digit state, 5 letters, 4 digits, 1 letter, 1 entity, Z, checksum.
  static final _gstinRe =
      RegExp(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$');

  _EntityType _entity = _EntityType.proprietor;
  bool _busy = false;
  String? _error;
  GstinResult? _verified;

  bool get _valid => _gstinRe.hasMatch(_gstin.text);

  @override
  void dispose() {
    _gstin.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await KycService.instance.verifyGstin(_gstin.text);
      if (r.verified) {
        setState(() => _verified = r);
      } else {
        setState(() => _error = 'We couldn’t verify this GSTIN. Check and try again.');
      }
    } catch (_) {
      setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final done = _verified != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Business profile')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(XSpacing.xl),
          children: [
            Text('Business type', style: XType.h3.copyWith(color: xc.textPrimary)),
            const SizedBox(height: XSpacing.md),
            Wrap(
              spacing: XSpacing.sm,
              runSpacing: XSpacing.sm,
              children: [
                for (final e in _EntityType.values)
                  _ChoiceChip(
                    label: e.label,
                    selected: _entity == e,
                    onTap: done ? null : () => setState(() => _entity = e),
                  ),
              ],
            ),
            const SizedBox(height: XSpacing.xxl),

            Text('GSTIN', style: XType.h3.copyWith(color: xc.textPrimary)),
            const SizedBox(height: XSpacing.xs),
            Text(
              'Optional — adds higher limits and a lower fee for GST-registered businesses.',
              style: XType.caption.copyWith(color: xc.textSecondary),
            ),
            const SizedBox(height: XSpacing.md),

            if (!done)
              TextField(
                controller: _gstin,
                enabled: !_busy,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [
                  LengthLimitingTextInputFormatter(15),
                  FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
                  TextInputFormatter.withFunction(
                    (_, n) => n.copyWith(text: n.text.toUpperCase()),
                  ),
                ],
                onChanged: (_) => setState(() {}),
                style: XType.h3.copyWith(color: xc.textPrimary, letterSpacing: 1.5),
                decoration: const InputDecoration(
                  labelText: '22AAAAA0000A1Z5',
                  counterText: '',
                ),
              )
            else
              _VerifiedBanner(result: _verified!),

            if (_error != null) ...[
              const SizedBox(height: XSpacing.md),
              Text(_error!, style: XType.caption.copyWith(color: xc.error)),
            ],

            const SizedBox(height: XSpacing.xxl),
            if (!done)
              XButton(
                label: 'Verify GSTIN',
                loading: _busy,
                onPressed: (_valid && !_busy) ? _verify : null,
              )
            else
              XButton(
                label: 'Done',
                onPressed: () => Navigator.of(context).pop(true),
              ),
          ],
        ),
      ),
    );
  }
}

class _VerifiedBanner extends StatelessWidget {
  const _VerifiedBanner({required this.result});
  final GstinResult result;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Container(
      padding: const EdgeInsets.all(XSpacing.lg),
      decoration: BoxDecoration(
        color: xc.bgSurface,
        borderRadius: BorderRadius.circular(XRadius.card),
        border: Border.all(color: xc.success),
      ),
      child: Row(
        children: [
          Icon(Icons.verified, color: xc.success),
          const SizedBox(width: XSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  result.legalName ?? 'GSTIN verified',
                  style: XType.body.copyWith(
                    color: xc.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (result.status != null)
                  Text('Status: ${result.status}',
                      style: XType.caption.copyWith(color: xc.textSecondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChoiceChip extends StatelessWidget {
  const _ChoiceChip({required this.label, required this.selected, this.onTap});
  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(XRadius.pill),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          gradient: selected ? xc.gradient : null,
          color: selected ? null : xc.bgSurface,
          borderRadius: BorderRadius.circular(XRadius.pill),
          border: selected ? null : Border.all(color: xc.border),
        ),
        child: Text(
          label,
          style: XType.caption.copyWith(
            color: selected ? Colors.white : xc.textPrimary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
