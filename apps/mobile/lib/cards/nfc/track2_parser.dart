/// Pure EMV parsing helpers for the NFC tab. No plugins, so unit-testable.
///
/// EMV "Track 2 Equivalent Data" (tag 57) is BCD: PAN, a 'D' separator nibble,
/// then the expiry as YYMM, the service code, and discretionary data padded
/// with 'F'. We only need the PAN and expiry.
class EmvTrack2 {
  const EmvTrack2({this.pan, this.expiry});
  final String? pan; // digits
  final String? expiry; // MM/YY
}

String _cleanHex(String hex) =>
    hex.toUpperCase().replaceAll(RegExp(r'[^0-9A-F]'), '');

EmvTrack2 parseTrack2Hex(String hex) {
  final s = _cleanHex(hex);
  final sep = s.indexOf('D');
  if (sep <= 0) return const EmvTrack2();
  final pan = s.substring(0, sep);
  String? expiry;
  if (s.length >= sep + 5) {
    final yymm = s.substring(sep + 1, sep + 5); // YYMM
    expiry = '${yymm.substring(2, 4)}/${yymm.substring(0, 2)}';
  }
  return EmvTrack2(pan: pan.isEmpty ? null : pan, expiry: expiry);
}

/// Extract the value of the first occurrence of a (single-byte) EMV tag from a
/// TLV hex blob. Simple short-form length only — enough for tags 57 and 4F in
/// the records we read. Returns the value as hex, or null.
String? extractEmvTag(String hex, String tag) {
  final s = _cleanHex(hex);
  final t = tag.toUpperCase();
  for (var i = 0; i + 4 <= s.length; i += 2) {
    if (s.substring(i, i + 2) == t) {
      final len = int.tryParse(s.substring(i + 2, i + 4), radix: 16);
      if (len == null) continue;
      final start = i + 4;
      final end = start + len * 2;
      if (end <= s.length) return s.substring(start, end);
    }
  }
  return null;
}
