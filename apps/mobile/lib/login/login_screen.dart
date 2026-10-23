import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../auth/session.dart';

/// Phone + OTP login. Both steps hit your backend (see Session).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  bool _otpSent = false;
  bool _busy = false;
  String? _error;

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<Session>();
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Xorpay',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 32),
                TextField(
                  controller: _phone,
                  enabled: !_otpSent,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Phone number',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (_otpSent) ...[
                  const SizedBox(height: 16),
                  TextField(
                    controller: _otp,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'OTP',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () => _run(() async {
                            if (!_otpSent) {
                              await session.requestOtp(_phone.text.trim());
                              setState(() => _otpSent = true);
                            } else {
                              await session.verifyOtp(
                                  _phone.text.trim(), _otp.text.trim());
                            }
                          }),
                  child: _busy
                      ? const SizedBox(
                          height: 20, width: 20, child: CircularProgressIndicator())
                      : Text(_otpSent ? 'Verify & sign in' : 'Send OTP'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
