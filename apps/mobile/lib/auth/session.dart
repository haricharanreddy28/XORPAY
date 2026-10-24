import 'package:flutter/foundation.dart';
import '../core/api_client.dart';
import '../core/secure_storage.dart';

/// Minimal auth/session controller.
///
/// A real app flow: request OTP -> verify OTP -> backend returns tokens.
/// The backend owns device/SIM binding and KYC gating; the client just
/// holds the resulting session token.
class Session extends ChangeNotifier {
  bool _authenticated = false;
  bool get isAuthenticated => _authenticated;

  Future<void> bootstrap() async {
    _authenticated = (await SecureStore.instance.accessToken) != null;
    notifyListeners();
  }

  /// Step 1: ask backend to send an OTP to [phone].
  Future<void> requestOtp(String phone) async {
    await ApiClient.instance.dio.post('/auth/otp/request', data: {'phone': phone});
  }

  /// Step 2: verify OTP; backend returns session tokens on success.
  Future<void> verifyOtp(String phone, String otp) async {
    final res = await ApiClient.instance.dio.post(
      '/auth/otp/verify',
      data: {'phone': phone, 'otp': otp},
    );
    await SecureStore.instance.saveTokens(
      accessToken: res.data['access_token'] as String,
      refreshToken: res.data['refresh_token'] as String?,
    );
    _authenticated = true;
    notifyListeners();
  }

  Future<void> logout() async {
    final refreshToken = await SecureStore.instance.refreshToken;
    if (refreshToken != null) {
      try {
        await ApiClient.instance.dio.post(
          '/auth/session/logout',
          data: {'refresh_token': refreshToken},
        );
      } catch (_) {
        // Local logout still succeeds if the API is offline.
      }
    }
    await SecureStore.instance.clear();
    _authenticated = false;
    notifyListeners();
  }
}
