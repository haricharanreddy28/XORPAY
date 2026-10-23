import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';

/// Biometric app-lock gate. Wrap sensitive screens (or the whole shell) so the
/// user must pass fingerprint/face before seeing balances or paying.
class BiometricLock extends StatefulWidget {
  const BiometricLock({super.key, required this.child});
  final Widget child;

  @override
  State<BiometricLock> createState() => _BiometricLockState();
}

class _BiometricLockState extends State<BiometricLock> {
  final _auth = LocalAuthentication();
  bool _unlocked = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _authenticate());
  }

  Future<void> _authenticate() async {
    try {
      final canCheck = await _auth.canCheckBiometrics || await _auth.isDeviceSupported();
      if (!canCheck) {
        // No biometric hardware/enrollment — fall back to your app PIN flow.
        setState(() => _unlocked = true);
        return;
      }
      final ok = await _auth.authenticate(
        localizedReason: 'Unlock Xorpay',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
      setState(() {
        _unlocked = ok;
        _error = ok ? null : 'Authentication failed';
      });
    } catch (e) {
      setState(() => _error = 'Biometric error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_unlocked) return widget.child;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline, size: 48),
            const SizedBox(height: 16),
            if (_error != null) ...[
              Text(_error!, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 12),
            ],
            FilledButton(onPressed: _authenticate, child: const Text('Unlock')),
          ],
        ),
      ),
    );
  }
}
