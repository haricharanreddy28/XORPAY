import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../beneficiaries/beneficiary_service.dart';
import '../payments/payment_service.dart';

/// Payment result screen with a status timeline and a branded PDF receipt
/// (spec §3.4, §7.7). The UTR appears once the payout settles (shown as
/// pending here since payout is asynchronous).
class ReceiptScreen extends StatelessWidget {
  const ReceiptScreen({
    super.key,
    required this.result,
    required this.order,
    required this.payee,
    required this.category,
    required this.payeeAmount,
  });

  final PaymentResult result;
  final OrderHandle order;
  final Beneficiary payee;
  final String category;
  final double payeeAmount; // rupees

  double _fee(String key, double fallback) =>
      ((order.fee?[key] as num?)?.toDouble() ?? fallback * 100) / 100;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final ok = result.status == PaymentStatus.success ||
        result.status == PaymentStatus.pending;
    final youPay = _fee('youPayMinor', payeeAmount);

    final steps = <TimelineStep>[
      const TimelineStep('Paid', done: true, sub: 'Collected from your card'),
      TimelineStep('Processing payout',
          done: result.status == PaymentStatus.success,
          active: result.status != PaymentStatus.success),
      TimelineStep('Credited to ${payee.displayName}',
          active: false, sub: result.status == PaymentStatus.success ? null : 'Usually within 2 hours'),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Receipt'), automaticallyImplyLeading: false),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(XSpacing.xl),
          children: [
            Center(
              child: Column(
                children: [
                  Icon(ok ? Icons.check_circle : Icons.error,
                      size: 72, color: ok ? xc.success : xc.error),
                  const SizedBox(height: XSpacing.md),
                  Text(XMoney.format(payeeAmount),
                      style: XType.amount(40).copyWith(color: xc.textPrimary)),
                  Text('to ${payee.displayName}',
                      style: XType.body.copyWith(color: xc.textSecondary)),
                ],
              ),
            ),
            const SizedBox(height: XSpacing.xxl),
            StatusTimeline(steps: steps),
            const SizedBox(height: XSpacing.lg),
            _DetailCard(
              rows: {
                'You paid': XMoney.format(youPay),
                'Category': category,
                'Reference': order.orderId,
                'Status': result.message ?? result.status.name,
              },
            ),
            const SizedBox(height: XSpacing.xl),
            XButton(
              label: 'Download receipt',
              icon: Icons.download_rounded,
              onPressed: () => _sharePdf(youPay),
            ),
            const SizedBox(height: XSpacing.md),
            XButton.secondary(
              label: 'Done',
              onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _sharePdf(double youPay) async {
    final doc = pw.Document();
    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        build: (ctx) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Container(
              width: double.infinity,
              padding: const pw.EdgeInsets.all(20),
              decoration: const pw.BoxDecoration(
                gradient: pw.LinearGradient(
                  colors: [PdfColor.fromInt(0xFF2563EB), PdfColor.fromInt(0xFF6C2BD9)],
                ),
              ),
              child: pw.Text('XORPAY',
                  style: pw.TextStyle(
                      color: PdfColors.white, fontSize: 24, fontWeight: pw.FontWeight.bold)),
            ),
            pw.SizedBox(height: 24),
            pw.Text('Payment receipt', style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 16),
            _pdfRow('Amount to payee', _money(payeeAmount)),
            _pdfRow('You paid', _money(youPay)),
            _pdfRow('Payee', payee.displayName),
            _pdfRow('Category', category),
            _pdfRow('Reference', order.orderId),
            _pdfRow('Status', result.status.name),
            pw.Spacer(),
            pw.Text('Paid via XORPAY',
                style: const pw.TextStyle(color: PdfColors.grey, fontSize: 10)),
          ],
        ),
      ),
    );
    await Printing.sharePdf(bytes: await doc.save(), filename: 'xorpay_${order.orderId}.pdf');
  }

  static String _money(double v) => XMoney.format(v);

  static pw.Widget _pdfRow(String label, String value) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 4),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text(label, style: const pw.TextStyle(color: PdfColors.grey800)),
            pw.Text(value, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
          ],
        ),
      );
}

class _DetailCard extends StatelessWidget {
  const _DetailCard({required this.rows});
  final Map<String, String> rows;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Container(
      padding: const EdgeInsets.all(XSpacing.lg),
      decoration: BoxDecoration(
        color: xc.bgSurface,
        borderRadius: BorderRadius.circular(XRadius.card),
        border: Border.all(color: xc.border),
      ),
      child: Column(
        children: [
          for (final e in rows.entries)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(e.key, style: XType.caption.copyWith(color: xc.textSecondary)),
                  Flexible(
                    child: Text(e.value,
                        textAlign: TextAlign.right,
                        style: XType.caption.copyWith(color: xc.textPrimary)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
