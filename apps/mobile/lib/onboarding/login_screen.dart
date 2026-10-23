import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../auth/session.dart';
import 'widgets/x_otp_field.dart';

/// Phone + OTP login (spec §7.7). Two steps: enter phone → enter OTP.
/// Backend calls go through [Session]. Trust line and branded styling.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  String _otp = '';
  bool _otpSent = false;
  bool _busy = false;
  bool _otpError = false;
  String? _error;

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
      _otpError = false;
    });
    try {
      await action();
    } catch (e) {
      setState(() {
        _error = _humanize(e);
        if (_otpSent) _otpError = true;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _humanize(Object e) =>
      'Something went wrong. Check your connection and try again.';

  Session get _session => context.read<Session>();

  Future<void> _sendOtp() => _run(() async {
        await _session.requestOtp(_phone.text.trim());
        if (mounted) setState(() => _otpSent = true);
      });

  Future<void> _verify() => _run(() async {
        await _session.verifyOtp(_phone.text.trim(), _otp);
      });

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      body: SafeArea(
        child: AutofillGroup(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(XSpacing.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: XSpacing.xxxl),
                Text('Welcome to XORPAY', style: XType.h1.copyWith(color: xc.textPrimary)),
                const SizedBox(height: XSpacing.sm),
                Text(
                  _otpSent
                      ? 'Enter the 6-digit code sent to +91 ${_phone.text}'
                      : 'Pay anything. Earn on everything.',
                  style: XType.body.copyWith(color: xc.textSecondary),
                ),
                const SizedBox(height: XSpacing.xxxl),

                if (!_otpSent)
                  _PhoneField(controller: _phone, enabled: !_busy)
                else
                  XOtpField(
                    error: _otpError,
                    enabled: !_busy,
                    onChanged: (v) => _otp = v,
                    onCompleted: (_) => _verify(),
                  ),

                if (_error != null) ...[
                  const SizedBox(height: XSpacing.md),
                  Text(_error!, style: XType.caption.copyWith(color: xc.error)),
                ],

                const SizedBox(height: XSpacing.xxl),
                XButton(
                  label: _otpSent ? 'Verify & sign in' : 'Send OTP',
                  loading: _busy,
                  onPressed: _busy
                      ? null
                      : (_otpSent ? _verify : _sendOtp),
                ),

                if (_otpSent) ...[
                  const SizedBox(height: XSpacing.md),
                  TextButton(
                    onPressed: _busy ? null : _sendOtp,
                    child: Text('Resend code',
                        style: XType.body.copyWith(color: xc.primary)),
                  ),
                ],

                const SizedBox(height: XSpacing.xxxl),
                Center(
                  child: Text(
                    '🔒  Bank-grade security · RBI-compliant partners',
                    style: XType.caption.copyWith(color: xc.textMuted),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }
}

class _PhoneField extends StatelessWidget {
  const _PhoneField({required this.controller, required this.enabled});
  final TextEditingController controller;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return TextField(
      controller: controller,
      enabled: enabled,
      keyboardType: TextInputType.phone,
      autofillHints: const [AutofillHints.telephoneNumberNational],
      inputFormatters: [
        FilteringTextInputFormatter.digitsOnly,
        LengthLimitingTextInputFormatter(10),
      ],
      style: XType.body.copyWith(color: xc.textPrimary),
      decoration: InputDecoration(
        labelText: 'Phone number',
        prefixText: '+91  ',
        prefixStyle: XType.body.copyWith(color: xc.textPrimary),
      ),
    );
  }
}
