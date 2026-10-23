// Minimal smoke test. Having this file also stops `flutter create .` from
// generating its default counter-app test, which would not match this app.
//
// Add real widget/unit tests as the app grows (mock ApiClient, test the
// UPI parser, payment-status mapping, etc.).

import 'package:flutter_test/flutter_test.dart';

import 'package:xorpay/payments/qr_scan_screen.dart';

void main() {
  test('UpiPayload parses a upi:// intent URI', () {
    final p = UpiPayload.tryParse('upi://pay?pa=merchant@upi&pn=Shop&am=10.00');
    expect(p, isNotNull);
    expect(p!.payeeVpa, 'merchant@upi');
    expect(p.payeeName, 'Shop');
    expect(p.amount, '10.00');
  });

  test('UpiPayload rejects a non-UPI URI', () {
    expect(UpiPayload.tryParse('https://example.com'), isNull);
  });
}
