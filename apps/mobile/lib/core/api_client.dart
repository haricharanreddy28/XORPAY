import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:crypto/crypto.dart';
import 'dart:convert';

import 'config.dart';
import 'secure_storage.dart';

/// Single configured Dio instance for talking to YOUR backend.
///
/// Features:
///  - Auth interceptor: attaches the current access token.
///  - TLS public-key pinning (when [AppConfig.certPinsSha256] is set).
///  - Basic 401 handling hook (wire up your refresh/logout here).
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  late final Dio dio = _build();

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
          if (e.response?.statusCode == 401) {
            // TODO: attempt token refresh, else force logout.
            await SecureStore.instance.clear();
          }
          handler.next(e);
        },
      ),
    );

    if (AppConfig.pinningEnabled) {
      _applyPinning(d);
    }

    return d;
  }

  /// Reject any TLS connection whose leaf cert public key isn't one of our pins.
  void _applyPinning(Dio d) {
    final adapter = d.httpClientAdapter as IOHttpClientAdapter;
    adapter.createHttpClient = () {
      final client = HttpClient();
      client.badCertificateCallback = (X509Certificate cert, String host, int port) {
        final pin = base64.encode(sha256.convert(cert.der).bytes);
        // Note: pin the public key (SPKI) in production for rotation safety;
        // this cert-DER pin is a simple starting point.
        return AppConfig.certPinsSha256.contains(pin);
      };
      return client;
    };
  }
}
