import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'pay_target.dart';
import 'payment_flow_screen.dart';

/// Shared "enter a reference, then pay" scaffold for biller categories
/// (GST / taxes / education) that don't use a saved payee.
class _BillerEntry extends StatelessWidget {
  const _BillerEntry({
    required this.appBarTitle,
    required this.heading,
    required this.note,
    required this.child,
    required this.canContinue,
    required this.onContinue,
  });

  final String appBarTitle;
  final String heading;
  final String note;
  final Widget child;
  final bool canContinue;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: Text(appBarTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(XSpacing.xl),
          children: [
            Text(heading, style: XType.h3.copyWith(color: xc.textPrimary)),
            const SizedBox(height: XSpacing.xs),
            Text(note, style: XType.caption.copyWith(color: xc.textSecondary)),
            const SizedBox(height: XSpacing.xl),
            child,
            const SizedBox(height: XSpacing.xxl),
            XButton(label: 'Continue', onPressed: canContinue ? onContinue : null),
          ],
        ),
      ),
    );
  }
}

void _go(BuildContext context, PayTarget target, String title, String purpose) {
  Navigator.of(context).pushReplacement(MaterialPageRoute(
    builder: (_) => PaymentFlowScreen(target: target, title: title, purpose: purpose),
  ));
}

// ---- GST challan --------------------------------------------------------
class GstPayScreen extends StatefulWidget {
  const GstPayScreen({super.key});
  @override
  State<GstPayScreen> createState() => _GstPayScreenState();
}

class _GstPayScreenState extends State<GstPayScreen> {
  final _cpin = TextEditingController();
  bool get _valid => _cpin.text.length == 14; // CPIN is 14 digits

  @override
  void dispose() {
    _cpin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _BillerEntry(
      appBarTitle: 'Pay GST',
      heading: 'GST challan',
      note: 'Generate the challan on the GST portal, then enter its CPIN here.',
      canContinue: _valid,
      onContinue: () => _go(
        context,
        PayTarget.biller(
          displayName: 'GST challan',
          category: 'gst',
          maskedAccount: 'CPIN ${_cpin.text}',
          reference: _cpin.text,
        ),
        'Pay GST',
        'GST challan ${_cpin.text}',
      ),
      child: TextField(
        controller: _cpin,
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(14),
        ],
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(labelText: 'CPIN (14 digits)'),
      ),
    );
  }
}

// ---- Taxes --------------------------------------------------------------
enum _TaxType { advance, selfAssessment }

extension on _TaxType {
  String get label =>
      this == _TaxType.advance ? 'Advance tax' : 'Self-assessment';
}

class TaxPayScreen extends StatefulWidget {
  const TaxPayScreen({super.key});
  @override
  State<TaxPayScreen> createState() => _TaxPayScreenState();
}

class _TaxPayScreenState extends State<TaxPayScreen> {
  _TaxType _type = _TaxType.advance;
  final _pan = TextEditingController();
  static final _panRe = RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$');
  bool get _valid => _panRe.hasMatch(_pan.text.toUpperCase());

  @override
  void dispose() {
    _pan.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _BillerEntry(
      appBarTitle: 'Pay taxes',
      heading: 'Direct tax',
      note: 'Pay advance or self-assessment tax against your PAN.',
      canContinue: _valid,
      onContinue: () => _go(
        context,
        PayTarget.biller(
          displayName: _type.label,
          category: 'tax',
          maskedAccount: 'PAN ${_pan.text.toUpperCase()}',
          reference: _pan.text.toUpperCase(),
        ),
        'Pay ${_type.label}',
        '${_type.label} ${_pan.text.toUpperCase()}',
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SegmentedButton<_TaxType>(
            segments: [
              for (final t in _TaxType.values)
                ButtonSegment(value: t, label: Text(t.label)),
            ],
            selected: {_type},
            onSelectionChanged: (s) => setState(() => _type = s.first),
          ),
          const SizedBox(height: XSpacing.md),
          TextField(
            controller: _pan,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [
              LengthLimitingTextInputFormatter(10),
              FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
              TextInputFormatter.withFunction(
                (_, n) => n.copyWith(text: n.text.toUpperCase()),
              ),
            ],
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'PAN'),
          ),
        ],
      ),
    );
  }
}

// ---- Education fees -----------------------------------------------------
class EducationPayScreen extends StatefulWidget {
  const EducationPayScreen({super.key});
  @override
  State<EducationPayScreen> createState() => _EducationPayScreenState();
}

class _EducationPayScreenState extends State<EducationPayScreen> {
  final _institute = TextEditingController();
  final _student = TextEditingController();
  bool get _valid =>
      _institute.text.trim().length > 2 && _student.text.trim().isNotEmpty;

  @override
  void dispose() {
    _institute.dispose();
    _student.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _BillerEntry(
      appBarTitle: 'Education fees',
      heading: 'School / college fees',
      note: 'Enter the institute and the student / enrollment id.',
      canContinue: _valid,
      onContinue: () => _go(
        context,
        PayTarget.biller(
          displayName: _institute.text.trim(),
          category: 'education',
          maskedAccount: 'Student ${_student.text.trim()}',
          reference: _student.text.trim(),
        ),
        'Education fees',
        'Fees for ${_student.text.trim()}',
      ),
      child: Column(
        children: [
          TextField(
            controller: _institute,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Institute name'),
          ),
          const SizedBox(height: XSpacing.md),
          TextField(
            controller: _student,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Student / enrollment id'),
          ),
        ],
      ),
    );
  }
}
