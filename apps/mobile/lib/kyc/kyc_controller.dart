import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import 'kyc_service.dart';

/// Drives the KYC onboarding flow, calling the backend /kyc endpoints via
/// [KycService]. Verification is decided server-side; this tracks the step,
/// a busy flag and the last error so the UI can react.
class KycController extends ChangeNotifier {
  KycController({KycService? service}) : _service = service ?? KycService.instance;

  final KycService _service;

  static const steps = ['PAN', 'Aadhaar', 'Selfie', 'Done'];

  int _index = 0;
  int get index => _index;

  bool _busy = false;
  bool get busy => _busy;

  String? _error;
  String? get error => _error;

  String? pan;
  String? panRegisteredName;
  bool aadhaarVerified = false;
  bool selfieCaptured = false;

  void _advance() {
    if (_index < steps.length - 1) _index++;
  }

  void back() {
    if (_index > 0) {
      _index--;
      _error = null;
      notifyListeners();
    }
  }

  /// Runs [action], managing busy/error state and notifying listeners.
  /// [action] returns true to advance, false to stay (shown as an error).
  Future<void> _run(Future<bool> Function() action, String failMessage) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      if (await action()) {
        _advance();
      } else {
        _error = failMessage;
      }
    } catch (_) {
      _error = 'Something went wrong. Please try again.';
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> submitPan(String value) => _run(() async {
        final r = await _service.verifyPan(value);
        if (r.verified) {
          pan = value.toUpperCase();
          panRegisteredName = r.registeredName;
        }
        return r.verified;
      }, 'We couldn’t verify this PAN. Check and try again.');

  /// Opens Cashfree DigiLocker, then checks consent and document status on return.
  Future<void> submitAadhaar() => _run(() async {
        final init = await _service.initAadhaar();
        final url = init.url;
        if (url == null || !await launchUrl(
          Uri.parse(url),
          mode: LaunchMode.externalApplication,
        )) {
          return false;
        }
        // DigiLocker may take a moment to return consent. Bound the status
        // checks so an abandoned session cannot keep onboarding busy.
        for (var attempt = 0; attempt < 12; attempt++) {
          await Future<void>.delayed(const Duration(seconds: 5));
          if (await _service.completeAadhaar(init.requestId)) {
            aadhaarVerified = true;
            return true;
          }
        }
        return false;
      }, 'Aadhaar verification didn’t complete. Please try again.');

  /// Sends a captured front-camera image to Cashfree Face Liveness.
  Future<void> submitSelfie(Uint8List imageBytes) => _run(() async {
        final session = await _service.selfieSession();
        final ok = await _service.completeSelfie(session.sessionId, imageBytes);
        selfieCaptured = ok;
        return ok;
      }, 'Selfie check didn’t pass. Please try again in good light.');

  void showError(String message) {
    _error = message;
    notifyListeners();
  }
}
