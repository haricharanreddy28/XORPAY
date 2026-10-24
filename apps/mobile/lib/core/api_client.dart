import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:crypto/crypto.dart';
import 'dart:convert';

import 'config.dart';
import 'secure_storage.dart';

/// Single configured Dio instance for talking to YOUR backend.
/// Handles bearer auth, rotating refresh sessions, and optional TLS pinning.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  late final Dio dio = _build();
  Future<String?>? _refreshInFlight;

  Dio _build() {
    final d = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Accept': 'application/json'},
      ),
    );

    d.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await SecureStore.instance.accessToken;
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (e, handler) async {
          final path = e.requestOptions.path;
          final alreadyRetried = e.requestOptions.extra['authRetry'] == true;
          final isAuthRequest = path.startsWith('/auth/');
          if (e.response?.statusCode != 401 || isAuthRequest || alreadyRetried) {
            handler.next(e);
            return;
          }

          String? accessToken;
          try {
            accessToken = await _refreshAccessToken();
          } catch (_) {
            // A transient network/server failure should not destroy a valid
            // refresh token. Let the original request surface its 401.
            handler.next(e);
            return;
          }

          if (accessToken == null) {
            await SecureStore.instance.clear();
            handler.next(e);
            return;
          }

          try {
            final options = e.requestOptions
              ..headers['Authorization'] = 'Bearer $accessToken'
              ..extra['authRetry'] = true;
            handler.resolve(await d.fetch(options));
          } catch (_) {
            await SecureStore.instance.clear();
            handler.next(e);
          }
        },
      ),
    );

    if (AppConfig.pinningEnabled) {
      _applyPinning(d);
    }

    return d;
  }

  Future<String?> _refreshAccessToken() {
    return _refreshInFlight ??= _performRefresh().whenComplete(() {
      _refreshInFlight = null;
    });
  }

  Future<String?> _performRefresh() async {
    final refreshToken = await SecureStore.instance.refreshToken;
    if (refreshToken == null) return null;
    try {
      final response = await dio.post(
        '/auth/session/refresh',
        data: {'refresh_token': refreshToken},
      );
      final access = response.data['access_token'] as String?;
      final refresh = response.data['refresh_token'] as String?;
      if (access == null || refresh == null) {
        throw StateError('Refresh response did not contain both tokens');
      }
      await SecureStore.instance.saveTokens(
        accessToken: access,
        refreshToken: refresh,
      );
      return access;
    } on DioException catch (error) {
      if (error.response?.statusCode == 401) return null;
      rethrow;
    }
  }

  /// Reject TLS connections unless the leaf certificate digest matches a pin.
  void _applyPinning(Dio d) {
    final adapter = d.httpClientAdapter as IOHttpClientAdapter;
    adapter.createHttpClient = () {
      final client = HttpClient();
      client.badCertificateCallback = (X509Certificate cert, String host, int port) {
        final pin = base64.encode(sha256.convert(cert.der).bytes);
        // Replace with an SPKI pin and a backup pin before a production release.
        return AppConfig.certPinsSha256.contains(pin);
      };
      return client;
    };
  }
}
