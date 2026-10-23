import 'package:flutter/foundation.dart';

/// Holds the KYC onboarding state. This is the UI shell: it tracks the step
/// and the data captured, but does NOT call verification APIs yet — the
/// HyperVerge / PAN / DigiLocker integrations are wired in Phase 2, replacing
/// the `submit*` stubs below.
class KycController extends ChangeNotifier {
  static const steps = ['PAN', 'Aadhaar', 'Selfie', 'Done'];

  int _index = 0;
  int get index => _index;

  String? pan;
  bool aadhaarVerified = false;
  bool selfieCaptured = false;

  void _advance() {
    if (_index < steps.length - 1) {
      _index++;
      notifyListeners();
    }
  }

  void back() {
    if (_index > 0) {
      _index--;
      notifyListeners();
    }
  }

  /// Phase 2: verify the PAN with the KYC provider before advancing.
  void submitPan(String value) {
    pan = value.toUpperCase();
    _advance();
  }

  /// Phase 2: launch DigiLocker / OKYC and confirm before advancing.
  void submitAadhaar() {
    aadhaarVerified = true;
    _advance();
  }

  /// Phase 2: capture a selfie, run liveness + face match before advancing.
  void submitSelfie() {
    selfieCaptured = true;
    _advance();
  }
}
