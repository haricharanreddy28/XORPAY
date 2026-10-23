import 'package:flutter_test/flutter_test.dart';
import 'package:xorpay/cards/nfc/track2_parser.dart';

void main() {
  test('parseTrack2Hex pulls PAN and MM/YY', () {
    // PAN 4111111111111111, 'D', YYMM=2512 (Dec 2025), then service/pad.
    final t = parseTrack2Hex('4111111111111111D2512201000000000F');
    expect(t.pan, '4111111111111111');
    expect(t.expiry, '12/25');
  });

  test('parseTrack2Hex returns empty when no separator', () {
    final t = parseTrack2Hex('4111111111111111');
    expect(t.pan, isNull);
    expect(t.expiry, isNull);
  });

  test('extractEmvTag finds tag 57 value', () {
    // 57 (tag) 0B (len=11 bytes) <22 hex chars value>
    const blob = '57' '0B' '4111111111111111D2512F';
    final v = extractEmvTag(blob, '57');
    expect(v, '4111111111111111D2512F');
    final t = parseTrack2Hex(v!);
    expect(t.pan, '4111111111111111');
    expect(t.expiry, '12/25');
  });

  test('extractEmvTag returns null when absent', () {
    expect(extractEmvTag('9F02060000', '57'), isNull);
  });
}
