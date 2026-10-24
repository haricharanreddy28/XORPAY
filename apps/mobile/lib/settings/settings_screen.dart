import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../account/account_service.dart';
import '../account/statements_screen.dart';
import '../auth/session.dart';
import '../notifications/notification_preferences_screen.dart';

/// Settings (spec §3.10): notifications, language, statements, logout, and
/// delete account (with a cooling period).
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late Future<Account> _account;

  @override
  void initState() {
    super.initState();
    _account = AccountService.instance.get();
  }

  Future<void> _setNotifications(bool v) async {
    await AccountService.instance.updateSettings(notificationsEnabled: v);
    setState(() => _account = AccountService.instance.get());
  }

  Future<void> _setLanguage(String lang) async {
    await AccountService.instance.updateSettings(language: lang);
    setState(() => _account = AccountService.instance.get());
  }

  Future<void> _deleteAccount() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete account?'),
        content: const Text(
            'Your account will be scheduled for deletion after a 30-day cooling '
            'period. You can cancel by signing in again before then.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Delete', style: TextStyle(color: context.xc.error)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final days = await AccountService.instance.deleteAccount();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Deletion scheduled in $days days.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: FutureBuilder<Account>(
        future: _account,
        builder: (context, snap) {
          final acc = snap.data;
          return ListView(
            padding: const EdgeInsets.all(XSpacing.xl),
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Notifications',
                    style: XType.body.copyWith(color: xc.textPrimary)),
                value: acc?.notificationsEnabled ?? true,
                onChanged: acc == null ? null : _setNotifications,
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.notifications_active_outlined, color: xc.primary),
                title: Text('Delivery preferences',
                    style: XType.body.copyWith(color: xc.textPrimary)),
                subtitle: const Text('SMS, email and push alerts'),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const NotificationPreferencesScreen()),
                ),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('Language',
                    style: XType.body.copyWith(color: xc.textPrimary)),
                trailing: DropdownButton<String>(
                  value: acc?.language ?? 'en',
                  items: const [
                    DropdownMenuItem(value: 'en', child: Text('English')),
                    DropdownMenuItem(value: 'hi', child: Text('हिन्दी')),
                  ],
                  onChanged: acc == null
                      ? null
                      : (v) {
                          if (v != null) _setLanguage(v);
                        },
                ),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.description_outlined, color: xc.primary),
                title: Text('Statements',
                    style: XType.body.copyWith(color: xc.textPrimary)),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const StatementsScreen()),
                ),
              ),
              const SizedBox(height: XSpacing.lg),
              XButton.secondary(
                label: 'Log out',
                icon: Icons.logout,
                onPressed: () {
                  context.read<Session>().logout();
                  Navigator.of(context).popUntil((r) => r.isFirst);
                },
              ),
              const SizedBox(height: XSpacing.md),
              TextButton(
                onPressed: _deleteAccount,
                child: Text('Delete account',
                    style: XType.body.copyWith(color: xc.error)),
              ),
            ],
          );
        },
      ),
    );
  }
}
