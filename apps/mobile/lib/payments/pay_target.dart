import '../beneficiaries/beneficiary_service.dart';

/// Destination of a payment. Either a saved payee (bank/UPI beneficiary) or a
/// "biller" (GST challan, tax, institute, card issuer) that isn't a saved payee.
/// This lets one checkout flow serve every category.
class PayTarget {
  const PayTarget({
    required this.displayName,
    required this.category,
    this.beneficiaryId,
    this.maskedAccount,
    this.verified = true,
    this.reference,
  });

  final String displayName;
  final String category; // 'vendor' | 'rent' | 'gst' | 'tax' | 'education' | 'card_bill'
  final String? beneficiaryId;
  final String? maskedAccount;
  final bool verified;

  /// Category-specific reference: CPIN, challan no., student id, card id, etc.
  final String? reference;

  factory PayTarget.payee(Beneficiary b,
          {required String category, String? reference}) =>
      PayTarget(
        displayName: b.displayName,
        category: category,
        beneficiaryId: b.id,
        maskedAccount: b.maskedAccount,
        verified: b.verified,
        reference: reference,
      );

  factory PayTarget.biller({
    required String displayName,
    required String category,
    String? maskedAccount,
    String? reference,
  }) =>
      PayTarget(
        displayName: displayName,
        category: category,
        maskedAccount: maskedAccount,
        reference: reference,
      );
}
