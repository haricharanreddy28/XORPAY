import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

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
  StreamSubscription<String>? _tokenRefreshSubscription;
  String? _registeredToken;

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

  Future<void> markRead(String id) async {
    await _dio.post('/notifications/$id/read');
  }

  Future<DeliveryPreferences> preferences() async {
    final res = await _dio.get('/notifications/preferences');
    return DeliveryPreferences.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> updatePreferences({bool? sms, bool? email, bool? push}) async {
    await _dio.patch('/notifications/preferences', data: <String, bool>{
      if (sms != null) 'sms': sms,
      if (email != null) 'email': email,
      if (push != null) 'push': push,
    });
  }

  Future<void> requestEmailVerification(String email) async {
    await _dio.post('/notifications/email/request', data: {'email': email});
  }

  Future<void> verifyEmail(String code) async {
    await _dio.post('/notifications/email/verify', data: {'code': code});
  }

  Future<void> registerCurrentDevice() async {
    if (Firebase.apps.isEmpty) return;
    try {
      final permission = await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
      if (permission.authorizationStatus == AuthorizationStatus.denied) return;
      final token = await FirebaseMessaging.instance.getToken();
      final platform = switch (defaultTargetPlatform) {
        TargetPlatform.android => 'android',
        TargetPlatform.iOS => 'ios',
        _ => null,
      };
      if (token == null || token.isEmpty || platform == null) return;
      await _registerToken(token, platform);
      _tokenRefreshSubscription ??= FirebaseMessaging.instance.onTokenRefresh.listen((nextToken) {
        unawaited(_registerToken(nextToken, platform));
      });
    } catch (_) {
      // Push is optional until Firebase project configuration is supplied.
    }
  }

  Future<void> _registerToken(String token, String platform) async {
    await _dio.post('/notifications/devices', data: {'token': token, 'platform': platform});
    _registeredToken = token;
  }

  Future<void> unregisterCurrentDevice() async {
    String? token = _registeredToken;
    if (token == null && Firebase.apps.isNotEmpty) {
      try { token = await FirebaseMessaging.instance.getToken(); } catch (_) {}
    }
    _registeredToken = null;
    await _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = null;
    if (token == null) return;
    try {
      await _dio.delete('/notifications/devices', data: {'token': token});
    } catch (_) {}
  }
}

class DeliveryPreferences {
  const DeliveryPreferences({
    required this.sms,
    required this.email,
    required this.push,
    required this.emailVerified,
    this.emailMasked,
  });
  final bool sms;
  final bool email;
  final bool push;
  final bool emailVerified;
  final String? emailMasked;

  factory DeliveryPreferences.fromJson(Map<String, dynamic> json) => DeliveryPreferences(
        sms: json['sms'] == true,
        email: json['email'] == true,
        push: json['push'] == true,
        emailVerified: json['emailVerified'] == true,
        emailMasked: json['emailMasked'] as String?,
      );
}
