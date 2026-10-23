import 'package:flutter_test/flutter_test.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

void main() {
  group('XFee.compute — 2% fee + 18% GST on fee', () {
    test('₹10,000 payee amount', () {
      final b = XFee.compute(10000);
      expect(b.payeeGets, 10000);
      expect(b.fee, 200); // 2%
      expect(b.gst, 36); // 18% of 200
      expect(b.youPay, 10236);
      expect(b.totalCharge, 236);
    });

    test('rounds to paise', () {
      final b = XFee.compute(999);
      expect(b.fee, 19.98); // 2% of 999
      expect(b.gst, 3.60); // 18% of 19.98 = 3.5964 -> 3.60
      expect(b.youPay, 1022.58);
    });

    test('custom rates', () {
      final b = XFee.compute(5000, feeRatePct: 1.5, gstOnFeePct: 18);
      expect(b.fee, 75);
      expect(b.gst, 13.5);
      expect(b.youPay, 5088.5);
    });

    test('zero amount', () {
      final b = XFee.compute(0);
      expect(b.youPay, 0);
      expect(b.totalCharge, 0);
    });
  });
}
