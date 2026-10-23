import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Scans a UPI/payment QR and returns the decoded string to the caller.
/// For UPI, the payload is a `upi://pay?pa=...&pn=...&am=...` URI you parse.
class QrScanScreen extends StatefulWidget {
  const QrScanScreen({super.key});

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  bool _handled = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan to pay')),
      body: MobileScanner(
        onDetect: (capture) {
          if (_handled) return;
          final raw = capture.barcodes.firstOrNull?.rawValue;
          if (raw == null) return;
          _handled = true;
          Navigator.of(context).pop(raw);
        },
      ),
    );
  }
}

/// Parsed fields from a UPI intent QR.
class UpiPayload {
  const UpiPayload({this.payeeVpa, this.payeeName, this.amount, this.note});
  final String? payeeVpa; // pa
  final String? payeeName; // pn
  final String? amount; // am
  final String? note; // tn

  static UpiPayload? tryParse(String raw) {
    final uri = Uri.tryParse(raw);
    if (uri == null || uri.scheme.toLowerCase() != 'upi') return null;
    final q = uri.queryParameters;
    return UpiPayload(
      payeeVpa: q['pa'],
      payeeName: q['pn'],
      amount: q['am'],
      note: q['tn'],
    );
  }
}
