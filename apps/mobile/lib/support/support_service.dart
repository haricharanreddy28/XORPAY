import '../core/api_client.dart';

class TicketMessage {
  const TicketMessage({required this.from, required this.body, required this.at});
  final String from; // 'user' | 'support'
  final String body;
  final DateTime at;

  factory TicketMessage.fromJson(Map<String, dynamic> j) => TicketMessage(
        from: (j['from'] as String?) ?? 'user',
        body: (j['body'] as String?) ?? '',
        at: DateTime.fromMillisecondsSinceEpoch((j['at'] as num?)?.toInt() ?? 0),
      );
}

class Ticket {
  const Ticket({
    required this.id,
    required this.subject,
    required this.status,
    required this.messages,
    this.txnId,
  });
  final String id;
  final String subject;
  final String status;
  final String? txnId;
  final List<TicketMessage> messages;

  bool get isDispute => txnId != null;

  factory Ticket.fromJson(Map<String, dynamic> j) => Ticket(
        id: j['id'] as String,
        subject: (j['subject'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'open',
        txnId: j['txnId'] as String?,
        messages: ((j['messages'] as List?) ?? [])
            .map((e) => TicketMessage.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class SupportService {
  SupportService._();
  static final SupportService instance = SupportService._();
  final _dio = ApiClient.instance.dio;

  Future<List<Ticket>> list() async {
    final res = await _dio.get('/support/tickets');
    return ((res.data['tickets'] as List?) ?? [])
        .map((e) => Ticket.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Ticket> get(String id) async {
    final res = await _dio.get('/support/tickets/$id');
    return Ticket.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Ticket> create({required String subject, required String body, String? txnId}) async {
    final res = await _dio.post('/support/tickets',
        data: {'subject': subject, 'body': body, 'txnId': txnId});
    return Ticket.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Ticket> reply(String id, String body) async {
    final res = await _dio.post('/support/tickets/$id/reply', data: {'body': body});
    return Ticket.fromJson(res.data as Map<String, dynamic>);
  }
}
