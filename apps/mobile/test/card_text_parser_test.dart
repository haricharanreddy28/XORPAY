import 'package:flutter_test/flutter_test.dart';
import 'package:xorpay/cards/scan/card_text_parser.dart';

void main() {
  test('extracts a Luhn-valid number and expiry from card-like OCR text', () {
    const text = 'XORPAY BANK\n4111 1111 1111 1111\nVALID THRU 12/25\nJOHN DOE';
    final c = parseCardText(text);
    expect(c.number, '4111111111111111');
    expect(c.expiry, '12/25');
  });

  test('ignores a non-Luhn digit run', () {
    final c = parseCardText('1234 5678 9012 3456 exp 09/27');
    expect(c.number, isNull);
    expect(c.expiry, '09/27'); // expiry still found
  });

  test('no card data -> empty', () {
    final c = parseCardText('just some random text 999');
    expect(c.hasAny, isFalse);
  });

  test('luhnValid basic', () {
    expect(luhnValid('4111111111111111'), isTrue);
    expect(luhnValid('4111111111111112'), isFalse);
  });
}
