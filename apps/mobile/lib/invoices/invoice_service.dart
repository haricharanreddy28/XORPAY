import '../core/api_client.dart';

/// A purchase invoice imported from GSTR-2A/2B (amounts in paise).
class Invoice {
  const Invoice({
    required this.id,
    required this.supplierGstin,
    required this.supplierName,
    required this.invoiceNo,
    required this.invoiceDate,
    required this.amountMinor,
    required this.status,
  });

  final String id;
  final String supplierGstin;
  final String supplierName;
  final String invoiceNo;
  final String invoiceDate;
  final int amountMinor;
  final String status; // 'unpaid' | 'paid'

  factory Invoice.fromJson(Map<String, dynamic> j) => Invoice(
        id: j['id'] as String,
        supplierGstin: (j['supplierGstin'] as String?) ?? '',
        supplierName: (j['supplierName'] as String?) ?? 'Supplier',
        invoiceNo: (j['invoiceNo'] as String?) ?? '',
        invoiceDate: (j['invoiceDate'] as String?) ?? '',
        amountMinor: (j['amountMinor'] as num?)?.toInt() ?? 0,
        status: (j['status'] as String?) ?? 'unpaid',
      );
}

/// Server-computed payable summary for a selection (with optional TDS).
class InvoiceQuote {
  const InvoiceQuote({
    required this.count,
    required this.grossMinor,
    required this.tdsMinor,
    required this.netMinor,
    required this.invoiceIds,
  });

  final int count;
  final int grossMinor;
  final int tdsMinor;
  final int netMinor;
  final List<String> invoiceIds;

  factory InvoiceQuote.fromJson(Map<String, dynamic> j) => InvoiceQuote(
        count: (j['count'] as num?)?.toInt() ?? 0,
        grossMinor: (j['grossMinor'] as num?)?.toInt() ?? 0,
        tdsMinor: (j['tdsMinor'] as num?)?.toInt() ?? 0,
        netMinor: (j['netMinor'] as num?)?.toInt() ?? 0,
        invoiceIds:
            ((j['invoiceIds'] as List?) ?? []).map((e) => e as String).toList(),
      );
}

class InvoiceService {
  InvoiceService._();
  static final InvoiceService instance = InvoiceService._();

  static const tdsRatePct = 2;

  final _dio = ApiClient.instance.dio;

  Future<List<Invoice>> list({String status = 'unpaid'}) async {
    final res = await _dio.get('/invoices', queryParameters: {'status': status});
    final list = (res.data['invoices'] as List?) ?? [];
    return list.map((i) => Invoice.fromJson(i as Map<String, dynamic>)).toList();
  }

  /// Import purchase invoices from GSTR-2A/2B. Returns the count imported.
  Future<int> pull({String source = '2B'}) async {
    final res = await _dio.post('/invoices/import', data: {'source': source});
    return (res.data['imported'] as num?)?.toInt() ?? 0;
  }

  Future<InvoiceQuote> quote(List<String> ids, {required bool withTds}) async {
    final res = await _dio.post('/invoices/quote', data: {
      'invoiceIds': ids,
      'withTds': withTds,
      'tdsRatePct': tdsRatePct,
    });
    return InvoiceQuote.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> markPaid(List<String> ids, {String? txnId}) async {
    await _dio.post('/invoices/mark-paid', data: {'invoiceIds': ids, 'txnId': txnId});
  }
}
