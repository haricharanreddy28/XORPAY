import '../core/api_client.dart';

/// Reads the user's limits from the backend (spec §3.4). The caps themselves
/// are authoritative server-side; this is for display and early warnings.
class LimitsService {
  LimitsService._();
  static final LimitsService instance = LimitsService._();

  final _dio = ApiClient.instance.dio;

  Future<Limits> fetch() async {
    final res = await _dio.get('/limits');
    return Limits.fromJson(res.data as Map<String, dynamic>);
  }

  /// Pre-check an amount before starting checkout.
  Future<LimitCheck> check(int amountMinor, {bool beneficiaryVerified = true}) async {
    final res = await _dio.post('/limits/check', data: {
      'amount': amountMinor,
      'beneficiaryVerified': beneficiaryVerified,
    });
    return LimitCheck(
      allowed: res.data['allowed'] == true,
      reason: res.data['reason'] as String?,
    );
  }
}

class Limits {
  const Limits({
    required this.tier,
    required this.perTxnMinor,
    required this.dailyMinor,
    required this.monthlyMinor,
    required this.remainingDailyMinor,
    required this.remainingMonthlyMinor,
  });

  final String tier;
  final int perTxnMinor;
  final int dailyMinor;
  final int monthlyMinor;
  final int remainingDailyMinor;
  final int remainingMonthlyMinor;

  bool get canPay => perTxnMinor > 0;

  /// Human label for the tier.
  String get tierLabel => switch (tier) {
        'GST' => 'GST verified',
        'FULL' => 'Full KYC',
        'PAN' => 'PAN verified',
        _ => 'Verify KYC',
      };

  static int _int(Object? v) => (v as num?)?.toInt() ?? 0;

  factory Limits.fromJson(Map<String, dynamic> j) => Limits(
        tier: j['tier'] as String? ?? 'MINIMAL',
        perTxnMinor: _int(j['perTxnMinor']),
        dailyMinor: _int(j['dailyMinor']),
        monthlyMinor: _int(j['monthlyMinor']),
        remainingDailyMinor: _int(j['remainingDailyMinor']),
        remainingMonthlyMinor: _int(j['remainingMonthlyMinor']),
      );
}

class LimitCheck {
  const LimitCheck({required this.allowed, this.reason});
  final bool allowed;
  final String? reason;

  /// A human message for a rejected check.
  String get message => switch (reason) {
        'kyc_required' => 'Complete KYC to start paying.',
        'per_transaction_limit' => 'Amount is over your per-transaction limit.',
        'daily_limit' => 'This exceeds your daily limit.',
        'monthly_limit' => 'This exceeds your monthly limit.',
        'unverified_payee_limit' => 'Verify this payee to pay a higher amount.',
        'invalid_amount' => 'Enter a valid amount.',
        _ => 'This payment isn’t allowed right now.',
      };
}
