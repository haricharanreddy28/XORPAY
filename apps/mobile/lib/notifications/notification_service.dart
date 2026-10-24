import '../core/api_client.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.read,
    required this.at,
    this.type,
  });

  final String id;
  final String title;
  final String body;
  final bool read;
  final DateTime at;
  final String? type;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? '',
        body: (j['body'] as String?) ?? '',
        read: j['read'] == true,
        at: DateTime.fromMillisecondsSinceEpoch((j['at'] as num?)?.toInt() ?? 0),
        type: j['type'] as String?,
      );
}

class NotificationFeed {
  const NotificationFeed({required this.items, required this.unread});
  final List<AppNotification> items;
  final int unread;
}

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final _dio = ApiClient.instance.dio;

  Future<NotificationFeed> list() async {
    final res = await _dio.get('/notifications');
    final items = ((res.data['notifications'] as List?) ?? [])
        .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
        .toList();
    return NotificationFeed(
      items: items,
      unread: (res.data['unread'] as num?)?.toInt() ?? 0,
    );
  }

  Future<void> markRead(String id) => _dio.post('/notifications/$id/read');
}
