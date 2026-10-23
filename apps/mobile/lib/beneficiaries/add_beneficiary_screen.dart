import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'beneficiary_service.dart';

/// Add a payee (spec §3.3): bank account + IFSC, or UPI id. On submit the
/// backend adds + name-verifies in one call; we then show the registered name
/// to confirm before using the payee.
class AddBeneficiaryScreen extends StatefulWidget {
  const AddBeneficiaryScreen({super.key});

  @override
  State<AddBeneficiaryScreen> createState() => _AddBeneficiaryScreenState();
}

enum _Type { bank, upi }

class _AddBeneficiaryScreenState extends State<AddBeneficiaryScreen> {
  _Type _type = _Type.bank;

  final _account = TextEditingController();
  final _confirmAccount = TextEditingController();
  final _ifsc = TextEditingController();
  final _vpa = TextEditingController();
  final _nickname = TextEditingController();

  bool _busy = false;
  String? _error;
  Beneficiary? _result;

  static final _ifscRe = RegExp(r'^[A-Z]{4}0[0-9A-Z]{6}$');
  static final _vpaRe = RegExp(r'^[\w.\-]{2,}@[a-zA-Z]{2,}$');

  bool get _valid {
    if (_type == _Type.bank) {
      final acc = _account.text;
      return RegExp(r'^\d{9,18}$').hasMatch(acc) &&
          acc == _confirmAccount.text &&
          _ifscRe.hasMatch(_ifsc.text.toUpperCase());
    }
    return _vpaRe.hasMatch(_vpa.text);
  }

  @override
  void dispose() {
    _account.dispose();
    _confirmAccount.dispose();
    _ifsc.dispose();
    _vpa.dispose();
    _nickname.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final nick = _nickname.text.trim().isEmpty ? null : _nickname.text.trim();
      final b = _type == _Type.bank
          ? await BeneficiaryService.instance.addBank(
              accountNumber: _account.text,
              ifsc: _ifsc.text.toUpperCase(),
              nickname: nick,
            )
          : await BeneficiaryService.instance.addUpi(
              vpa: _vpa.text,
              nickname: nick,
            );
      setState(() => _result = b);
    } catch (_) {
      setState(() => _error = 'Couldn’t add this payee. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add payee')),
      body: SafeArea(
        child: _result != null
            ? _ResultView(
                result: _result!,
                onDone: () => Navigator.of(context).pop(true),
              )
            : _form(context),
      ),
    );
  }

  Widget _form(BuildContext context) {
    final xc = context.xc;
    return ListView(
      padding: const EdgeInsets.all(XSpacing.xl),
      children: [
        SegmentedButton<_Type>(
          segments: const [
            ButtonSegment(value: _Type.bank, label: Text('Bank account')),
            ButtonSegment(value: _Type.upi, label: Text('UPI ID')),
          ],
          selected: {_type},
          onSelectionChanged: (s) => setState(() => _type = s.first),
        ),
        const SizedBox(height: XSpacing.xxl),

        if (_type == _Type.bank) ...[
          TextField(
            controller: _account,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(18),
            ],
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Account number'),
          ),
          const SizedBox(height: XSpacing.md),
          TextField(
            controller: _confirmAccount,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(18),
            ],
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Confirm account number'),
          ),
          const SizedBox(height: XSpacing.md),
          TextField(
            controller: _ifsc,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [
              LengthLimitingTextInputFormatter(11),
              FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
              TextInputFormatter.withFunction(
                (_, n) => n.copyWith(text: n.text.toUpperCase()),
              ),
            ],
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'IFSC'),
          ),
        ] else
          TextField(
            controller: _vpa,
            keyboardType: TextInputType.emailAddress,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'UPI ID (name@bank)'),
          ),

        const SizedBox(height: XSpacing.md),
        TextField(
          controller: _nickname,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Nickname (optional)'),
        ),

        if (_error != null) ...[
          const SizedBox(height: XSpacing.md),
          Text(_error!, style: XType.caption.copyWith(color: xc.error)),
        ],

        const SizedBox(height: XSpacing.xl),
        XButton(
          label: 'Verify & add',
          loading: _busy,
          onPressed: (_valid && !_busy) ? _submit : null,
        ),
      ],
    );
  }
}

/// Shows the verification outcome: the registered name to confirm, or an
/// unverified warning (the payee is still saved, with lower limits).
class _ResultView extends StatelessWidget {
  const _ResultView({required this.result, required this.onDone});
  final Beneficiary result;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final ok = result.verified;
    final color = ok ? xc.success : xc.warning;

    return Padding(
      padding: const EdgeInsets.all(XSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: XSpacing.xxl),
          Icon(ok ? Icons.verified : Icons.info_outline, size: 64, color: color),
          const SizedBox(height: XSpacing.lg),
          Text(
            ok ? 'Verified' : 'Could not verify name',
            textAlign: TextAlign.center,
            style: XType.h2.copyWith(color: xc.textPrimary),
          ),
          const SizedBox(height: XSpacing.sm),
          if (ok && result.registeredName != null)
            Text(
              result.registeredName!,
              textAlign: TextAlign.center,
              style: XType.h3.copyWith(color: color, fontWeight: FontWeight.w700),
            )
          else
            Text(
              'Saved as unverified. Payments to this payee are capped until '
              'verification succeeds.',
              textAlign: TextAlign.center,
              style: XType.body.copyWith(color: xc.textSecondary),
            ),
          if (result.maskedAccount != null) ...[
            const SizedBox(height: XSpacing.xs),
            Text(result.maskedAccount!,
                textAlign: TextAlign.center,
                style: XType.caption.copyWith(color: xc.textMuted)),
          ],
          const Spacer(),
          XButton(label: ok ? 'Confirm payee' : 'Done', onPressed: onDone),
        ],
      ),
    );
  }
}
