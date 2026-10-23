import '../core/api_client.dart';

/// A transaction as the backend returns it (amounts in paise).
class Txn {
  const Txn({
    required this.id,
    required this.state,
    required this.createdAt,
    required this.payeeMinor,
    required this.youPayMinor,
    required this.feeMinor,
    required this.gstMinor,
    this.category,
    this.utr,
    this.failureReason,
  });

  final String id;
  final String state;
  final DateTime createdAt;
  final int payeeMinor;
  final int youPayMinor;
  final int feeMinor;
  final int gstMinor;
  final String? category;
  final String? utr;
  final String? failureReason;

  bool get isSuccess => state == 'SUCCESS';
  bool get isFailed => state == 'FAILED' || state == 'REFUND_INITIATED' || state == 'REFUNDED';
  bool get isPending => !isSuccess && !isFailed;

  static int _m(Map fee, String k) => (fee[k] as num?)?.toInt() ?? 0;

  factory Txn.fromJson(Map<String, dynamic> j) {
    final fee = (j['fee'] as Map?) ?? const {};
    return Txn(
      id: j['id'] as String,
      state: (j['state'] as String?) ?? 'CREATED',
      createdAt: DateTime.fromMillisecondsSinceEpoch(
          (j['createdAt'] as num?)?.toInt() ?? 0),
      payeeMinor: _m(fee, 'payeeMinor'),
      youPayMinor: _m(fee, 'youPayMinor'),
      feeMinor: _m(fee, 'feeMinor'),
      gstMinor: _m(fee, 'gstMinor'),
      category: j['category'] as String?,
      utr: j['utr'] as String?,
      failureReason: j['failureReason'] as String?,
    );
  }
}

class TransactionService {
  TransactionService._();
  static final TransactionService instance = TransactionService._();

  final _dio = ApiClient.instance.dio;

  Future<List<Txn>> list() async {
    final res = await _dio.get('/transactions');
    final list = (res.data['transactions'] as List?) ?? [];
    return list.map((t) => Txn.fromJson(t as Map<String, dynamic>)).toList();
  }

  Future<Txn> get(String id) async {
    final res = await _dio.get('/transactions/$id');
    return Txn.fromJson(res.data as Map<String, dynamic>);
  }
}
