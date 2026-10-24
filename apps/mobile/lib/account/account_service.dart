import '../core/api_client.dart';
import '../payments/transaction_service.dart';

class Account {
  const Account({
    required this.phone,
    required this.language,
    required this.notificationsEnabled,
    this.deletionScheduledAt,
  });
  final String phone;
  final String language;
  final bool notificationsEnabled;
  final DateTime? deletionScheduledAt;

  factory Account.fromJson(Map<String, dynamic> j) => Account(
        phone: (j['phone'] as String?) ?? '',
        language: (j['language'] as String?) ?? 'en',
        notificationsEnabled: j['notificationsEnabled'] != false,
        deletionScheduledAt: j['deletionScheduledAt'] == null
            ? null
            : DateTime.fromMillisecondsSinceEpoch((j['deletionScheduledAt'] as num).toInt()),
      );
}

class AccountService {
  AccountService._();
  static final AccountService instance = AccountService._();
  final _dio = ApiClient.instance.dio;

  Future<Account> get() async {
    final res = await _dio.get('/account');
    return Account.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Account> updateSettings({String? language, bool? notificationsEnabled}) async {
    final res = await _dio.post('/account/settings', data: {
      if (language != null) 'language': language,
      if (notificationsEnabled != null) 'notificationsEnabled': notificationsEnabled,
    });
    return Account.fromJson(res.data as Map<String, dynamic>);
  }

  /// Schedules deletion after a cooling period. Returns the days.
  Future<int> deleteAccount() async {
    final res = await _dio.post('/account/delete');
    return (res.data['coolingDays'] as num?)?.toInt() ?? 30;
  }

  Future<List<Txn>> statements({required DateTime from, required DateTime to}) async {
    final res = await _dio.get('/account/statements', queryParameters: {
      'from': from.millisecondsSinceEpoch,
      'to': to.millisecondsSinceEpoch,
    });
    return ((res.data['transactions'] as List?) ?? [])
        .map((e) => Txn.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
