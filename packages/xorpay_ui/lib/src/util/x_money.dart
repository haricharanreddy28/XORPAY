/// Indian-grouping money formatting (spec §7.3): `₹1,25,000.00`.
///
/// The lakh/crore system groups the last 3 digits, then every 2 digits:
///   1234567.5 -> "12,34,567.50"
class XMoney {
  XMoney._();

  static const rupee = '₹'; // ₹

  /// Format [amountMajor] (rupees) with Indian digit grouping.
  /// [decimals] controls fraction digits; [symbol] prefixes ₹ when true.
  static String format(
    num amountMajor, {
    int decimals = 2,
    bool symbol = true,
  }) {
    final negative = amountMajor < 0;
    final value = amountMajor.abs();

    final fixed = value.toStringAsFixed(decimals);
    final parts = fixed.split('.');
    final grouped = _groupIndian(parts[0]);
    final frac = parts.length > 1 ? '.${parts[1]}' : '';

    final sign = negative ? '-' : '';
    final sym = symbol ? rupee : '';
    return '$sign$sym$grouped$frac';
  }

  /// Convenience for minor units (paise) -> formatted rupees.
  static String fromMinor(int amountMinor, {bool symbol = true}) =>
      format(amountMinor / 100, symbol: symbol);

  static String _groupIndian(String intPart) {
    if (intPart.length <= 3) return intPart;
    final last3 = intPart.substring(intPart.length - 3);
    var rest = intPart.substring(0, intPart.length - 3);

    // Collect leading groups of 2 (right to left), then reassemble left to right.
    final groups = <String>[];
    while (rest.length > 2) {
      groups.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    groups.insert(0, rest); // leading 1–2 digits

    return '${groups.join(',')},$last3';
  }
}
