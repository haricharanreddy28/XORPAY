import 'package:flutter/foundation.dart';

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

  /// DigiLocker: start then complete. (A full flow opens [AadhaarInit.url] for
  /// consent between these calls; the dev stub completes immediately.)
  Future<void> submitAadhaar() => _run(() async {
        final init = await _service.initAadhaar();
        final ok = await _service.completeAadhaar(init.requestId);
        aadhaarVerified = ok;
        return ok;
      }, 'Aadhaar verification didn’t complete. Please try again.');

  /// Liveness: mint a session then record the result. (A full flow runs the
  /// Face SDK with [SelfieSession.sdkToken] between these calls.)
  Future<void> submitSelfie() => _run(() async {
        final session = await _service.selfieSession();
        final ok = await _service.completeSelfie(session.sessionId);
        selfieCaptured = ok;
        return ok;
      }, 'Selfie check didn’t pass. Please try again in good light.');
}
