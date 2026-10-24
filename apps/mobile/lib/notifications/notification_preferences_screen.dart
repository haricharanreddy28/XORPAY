import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'notification_service.dart';

class NotificationPreferencesScreen extends StatefulWidget {
  const NotificationPreferencesScreen({super.key});
  @override
  State<NotificationPreferencesScreen> createState() => _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState extends State<NotificationPreferencesScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  DeliveryPreferences? _preferences;
  bool _loading = true, _sending = false, _verifying = false, _codeSent = false;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() { _email.dispose(); _code.dispose(); super.dispose(); }

  Future<void> _load() async {
    try {
      final value = await NotificationService.instance.preferences();
      if (mounted) setState(() { _preferences = value; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'Could not load notification settings.'; });
    }
  }

  Future<void> _requestCode() async {
    setState(() { _sending = true; _error = null; });
    try {
      await NotificationService.instance.requestEmailVerification(_email.text.trim());
      if (mounted) setState(() => _codeSent = true);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not send a code. Check the address and retry.');
    } finally { if (mounted) setState(() => _sending = false); }
  }

  Future<void> _verifyEmail() async {
    setState(() { _verifying = true; _error = null; });
    try {
      await NotificationService.instance.verifyEmail(_code.text.trim());
      if (!mounted) return;
      _code.clear();
      _codeSent = false;
      await _load();
    } catch (_) {
      if (mounted) setState(() => _error = 'That code is invalid or expired. Request another.');
    } finally { if (mounted) setState(() => _verifying = false); }
  }

  Future<void> _set(String channel, bool enabled) async {
    try {
      await NotificationService.instance.updatePreferences(
        sms: channel == 'sms' ? enabled : null,
        email: channel == 'email' ? enabled : null,
        push: channel == 'push' ? enabled : null,
      );
      await _load();
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not save that setting. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final prefs = _preferences;
    return Scaffold(
      appBar: AppBar(title: const Text('Delivery preferences')),
      body: _loading ? const Center(child: CircularProgressIndicator()) : ListView(
        padding: const EdgeInsets.all(XSpacing.xl),
        children: [
          Text('Choose how XORPAY contacts you about account and payment activity.',
              style: XType.body.copyWith(color: xc.textSecondary)),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('SMS alerts', style: XType.body.copyWith(color: xc.textPrimary)),
            value: prefs?.sms ?? false,
            onChanged: (value) => _set('sms', value),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('Push notifications', style: XType.body.copyWith(color: xc.textPrimary)),
            value: prefs?.push ?? false,
            onChanged: (value) => _set('push', value),
          ),
          const Divider(),
          Text('Email alerts', style: XType.h3.copyWith(color: xc.textPrimary)),
          const SizedBox(height: XSpacing.sm),
          if (prefs?.emailVerified == true) ...[
            Text('Verified email: ${prefs?.emailMasked ?? 'on file'}',
                style: XType.caption.copyWith(color: xc.success)),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('Send email alerts', style: XType.body.copyWith(color: xc.textPrimary)),
              value: prefs?.email ?? false,
              onChanged: (value) => _set('email', value),
            ),
          ] else ...[
            TextField(controller: _email, keyboardType: TextInputType.emailAddress,
                autocorrect: false, decoration: const InputDecoration(labelText: 'Email address')),
            const SizedBox(height: XSpacing.md),
            XButton(label: _sending ? 'Sending code…' : 'Send verification code',
                loading: _sending, onPressed: _sending ? null : _requestCode),
            if (_codeSent) ...[
              const SizedBox(height: XSpacing.md),
              TextField(controller: _code, keyboardType: TextInputType.number,
                  maxLength: 6, decoration: const InputDecoration(labelText: '6-digit code')),
              XButton(label: _verifying ? 'Verifying…' : 'Verify email',
                  loading: _verifying, onPressed: _verifying ? null : _verifyEmail),
            ],
          ],
          if (_error != null) ...[
            const SizedBox(height: XSpacing.md),
            Text(_error!, style: XType.caption.copyWith(color: xc.error)),
          ],
        ],
      ),
    );
  }
}
