import 'package:firebase_core/firebase_core.dart';

/// Provide these values through Flutter build-time defines; do not commit Firebase keys.
class XorpayFirebaseOptions {
  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const _senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const _iosBundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');

  static FirebaseOptions? get current {
    if (_apiKey.isEmpty || _appId.isEmpty || _senderId.isEmpty || _projectId.isEmpty) return null;
    return FirebaseOptions(
      apiKey: _apiKey,
      appId: _appId,
      messagingSenderId: _senderId,
      projectId: _projectId,
      iosBundleId: _iosBundleId.isEmpty ? null : _iosBundleId,
    );
  }
}
