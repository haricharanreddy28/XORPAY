import '../core/api_client.dart';

/// A saved payee as the backend returns it (no full account number).
class Beneficiary {
  const Beneficiary({
    required this.id,
    required this.type,
    required this.verified,
    this.nickname,
    this.maskedAccount,
    this.registeredName,
    this.ifsc,
  });

  final String id;
  final String type; // 'bank' | 'upi'
  final bool verified;
  final String? nickname;
  final String? maskedAccount;
  final String? registeredName;
  final String? ifsc;

  /// Best display name: nickname → verified registered name → handle.
  String get displayName =>
      nickname ?? registeredName ?? maskedAccount ?? 'Payee';

  factory Beneficiary.fromJson(Map<String, dynamic> j) => Beneficiary(
        id: j['id'] as String,
        type: (j['type'] as String?) ?? 'bank',
        verified: j['verified'] == true,
        nickname: j['nickname'] as String?,
        maskedAccount: j['maskedAccount'] as String?,
        registeredName: j['registeredName'] as String?,
        ifsc: j['ifsc'] as String?,
      );
}

class BeneficiaryService {
  BeneficiaryService._();
  static final BeneficiaryService instance = BeneficiaryService._();

  final _dio = ApiClient.instance.dio;

  Future<List<Beneficiary>> list() async {
    final res = await _dio.get('/beneficiaries');
    final list = (res.data['beneficiaries'] as List?) ?? [];
    return list
        .map((b) => Beneficiary.fromJson(b as Map<String, dynamic>))
        .toList();
  }

  /// Adds a bank beneficiary (account + IFSC); the backend verifies the name.
  Future<Beneficiary> addBank({
    required String accountNumber,
    required String ifsc,
    String? nickname,
  }) async {
    final res = await _dio.post('/beneficiaries', data: {
      'type': 'bank',
      'accountNumber': accountNumber,
      'ifsc': ifsc,
      'nickname': nickname,
    });
    return Beneficiary.fromJson(res.data as Map<String, dynamic>);
  }

  /// Adds a UPI beneficiary (VPA); the backend verifies the name.
  Future<Beneficiary> addUpi({required String vpa, String? nickname}) async {
    final res = await _dio.post('/beneficiaries', data: {
      'type': 'upi',
      'vpa': vpa,
      'nickname': nickname,
    });
    return Beneficiary.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Beneficiary> reverify(String id) async {
    final res = await _dio.post('/beneficiaries/$id/verify');
    return Beneficiary.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> remove(String id) => _dio.delete('/beneficiaries/$id');
}
