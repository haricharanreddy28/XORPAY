import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Thin wrapper over platform keystore/keychain for short-lived tokens.
/// Never store card numbers, CVVs, or PSP secret keys here.
class SecureStore {
  SecureStore._();
  static final SecureStore instance = SecureStore._();

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _kAccessToken = 'access_token';
  static const _kRefreshToken = 'refresh_token';
  static const _kIntroSeen = 'intro_seen';
  static const _kKycDone = 'kyc_done';

  Future<void> saveTokens({
    required String accessToken,
    String? refreshToken,
  }) async {
    await _storage.write(key: _kAccessToken, value: accessToken);
    if (refreshToken != null) {
      await _storage.write(key: _kRefreshToken, value: refreshToken);
    }
  }

  Future<String?> get accessToken => _storage.read(key: _kAccessToken);
  Future<String?> get refreshToken => _storage.read(key: _kRefreshToken);

  /// Whether the intro carousel has been shown (survives logout).
  Future<bool> get introSeen async =>
      (await _storage.read(key: _kIntroSeen)) == '1';
  Future<void> markIntroSeen() => _storage.write(key: _kIntroSeen, value: '1');

  /// Whether KYC onboarding has been completed (shell flag; cleared on logout).
  Future<bool> get kycDone async =>
      (await _storage.read(key: _kKycDone)) == '1';
  Future<void> markKycDone() => _storage.write(key: _kKycDone, value: '1');

  /// Clears auth (and KYC) — keeps non-auth prefs like [introSeen].
  Future<void> clear() async {
    await _storage.delete(key: _kAccessToken);
    await _storage.delete(key: _kRefreshToken);
    await _storage.delete(key: _kKycDone);
  }
}
