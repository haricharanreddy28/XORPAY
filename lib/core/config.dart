/// App configuration.
///
/// IMPORTANT: Anything in the shipped app binary is public — every user can
/// extract it. So NO secret keys live here. Only your backend holds PSP secret
/// keys; the client receives short-lived session tokens and payment "order"
/// handles created server-side.
///
/// Values are injected at build time with --dart-define, e.g.:
///   flutter run \
///     --dart-define=API_BASE_URL=https://api.yourbackend.com \
///     --dart-define=PSP_PUBLISHABLE_KEY=rzp_test_xxx
class AppConfig {
  /// Your own backend base URL (the only thing the app talks to directly).
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.example.com',
  );

  /// PSP *publishable* key only (safe to ship). The PSP secret key stays
  /// on your backend and is never embedded in the app.
  static const String pspPublishableKey = String.fromEnvironment(
    'PSP_PUBLISHABLE_KEY',
    defaultValue: '',
  );

  /// Cashfree environment: 'SANDBOX' (default) or 'PRODUCTION'.
  /// Mapped to CFEnvironment inside PaymentService.
  static const String cashfreeEnv = String.fromEnvironment(
    'CASHFREE_ENV',
    defaultValue: 'SANDBOX',
  );

  static bool get cashfreeIsProduction =>
      cashfreeEnv.toUpperCase() == 'PRODUCTION';

  /// Sentry DSN (optional). Empty disables crash reporting.
  static const String sentryDsn = String.fromEnvironment(
    'SENTRY_DSN',
    defaultValue: '',
  );

  /// SHA-256 public-key pins for your API domain, base64-encoded.
  /// Generate from your server cert's public key; include a backup pin.
  /// Leaving this empty disables pinning (fine for local dev only).
  static const List<String> certPinsSha256 = [
    // 'base64PrimaryPin==',
    // 'base64BackupPin==',
  ];

  static bool get pinningEnabled => certPinsSha256.isNotEmpty;
}
