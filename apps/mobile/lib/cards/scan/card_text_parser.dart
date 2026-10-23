/// Pure parser: pulls a card number + expiry out of OCR'd text. No plugins,
/// so it's unit-testable. Used by the camera scan tab.
class ScannedCard {
  const ScannedCard({this.number, this.expiry});
  final String? number; // digits only
  final String? expiry; // MM/YY
  bool get hasAny => number != null || expiry != null;
}

bool luhnValid(String digits) {
  var sum = 0;
  var alt = false;
  for (var i = digits.length - 1; i >= 0; i--) {
    var d = digits.codeUnitAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 == 0;
}

ScannedCard parseCardText(String text) {
  String? number;
  // Candidate: 13–19 digits, optionally spaced/dashed in groups.
  final numRe = RegExp(r'(?:\d[ \-]?){13,19}');
  for (final m in numRe.allMatches(text)) {
    final d = m.group(0)!.replaceAll(RegExp(r'\D'), '');
    if (d.length >= 13 && d.length <= 19 && luhnValid(d)) {
      number = d;
      break;
    }
  }

  String? expiry;
  // MM/YY with a slash, to avoid matching parts of the card number.
  final expRe = RegExp(r'\b(0[1-9]|1[0-2])\s*/\s*(\d{2})\b');
  final em = expRe.firstMatch(text);
  if (em != null) expiry = '${em.group(1)}/${em.group(2)}';

  return ScannedCard(number: number, expiry: expiry);
}
