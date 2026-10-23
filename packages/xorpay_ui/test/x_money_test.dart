import 'package:flutter_test/flutter_test.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

void main() {
  group('XMoney.format — Indian grouping', () {
    test('thousands', () {
      expect(XMoney.format(25000), '₹25,000.00');
    });
    test('lakh grouping (3 then 2)', () {
      expect(XMoney.format(125000), '₹1,25,000.00');
    });
    test('crore grouping', () {
      expect(XMoney.format(12345678.5), '₹1,23,45,678.50');
    });
    test('small value, no grouping', () {
      expect(XMoney.format(999), '₹999.00');
    });
    test('negative', () {
      expect(XMoney.format(-5000), '-₹5,000.00');
    });
    test('no symbol, zero decimals', () {
      expect(XMoney.format(100000, decimals: 0, symbol: false), '1,00,000');
    });
    test('fromMinor (paise -> rupees)', () {
      expect(XMoney.fromMinor(125000), '₹1,250.00');
    });
  });
}
