/// Pure fee math (spec §9): platform fee % + 18% GST on the fee.
///
/// Kept dependency-free so it's unit-testable and reusable by both the UI
/// (AmountPad / FeeBreakdownSheet) and the backend fee engine later.
///
/// Model: the user enters what the **payee receives**; fees are added on top.
///   fee   = payeeGets * feeRatePct%
///   gst   = fee * gstOnFeePct%          (GST is charged on the fee, not the amount)
///   youPay = payeeGets + fee + gst
class XFee {
  XFee._();

  /// Compute a breakdown from the amount the payee should receive.
  /// All inputs/outputs are in rupees (major units). Values are rounded to paise.
  static FeeBreakdown compute(
    double payeeGets, {
    double feeRatePct = 2.0,
    double gstOnFeePct = 18.0,
  }) {
    final fee = _round2(payeeGets * feeRatePct / 100);
    final gst = _round2(fee * gstOnFeePct / 100);
    final youPay = _round2(payeeGets + fee + gst);
    return FeeBreakdown(
      payeeGets: _round2(payeeGets),
      fee: fee,
      gst: gst,
      youPay: youPay,
    );
  }

  static double _round2(double v) => (v * 100).roundToDouble() / 100;
}

class FeeBreakdown {
  const FeeBreakdown({
    required this.payeeGets,
    required this.fee,
    required this.gst,
    required this.youPay,
  });

  /// What lands in the beneficiary's account.
  final double payeeGets;

  /// Platform fee.
  final double fee;

  /// GST charged on the fee.
  final double gst;

  /// Total the user is charged.
  final double youPay;

  /// fee + gst — the total cost on top of the amount.
  double get totalCharge => fee + gst;
}
