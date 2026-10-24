import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'notification_service.dart';

/// Notification centre (spec §3.9): list, with unread markers and mark-read.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late Future<NotificationFeed> _feed;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() => _feed = NotificationService.instance.list());
  }

  Future<void> _open(AppNotification n) async {
    if (!n.read) {
      await NotificationService.instance.markRead(n.id);
      _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: FutureBuilder<NotificationFeed>(
          future: _feed,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            final items = snap.data?.items ?? const [];
            if (items.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 120),
                  Icon(Icons.notifications_none, size: 64, color: xc.textMuted),
                  const SizedBox(height: XSpacing.lg),
                  Center(
                    child: Text('You’re all caught up',
                        style: XType.h3.copyWith(color: xc.textPrimary)),
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: XSpacing.sm),
              itemCount: items.length,
              separatorBuilder: (_, __) => Divider(color: xc.border, height: 1),
              itemBuilder: (context, i) {
                final n = items[i];
                return ListTile(
                  onTap: () => _open(n),
                  leading: Container(
                    width: 10,
                    height: 10,
                    margin: const EdgeInsets.only(top: 6),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: n.read ? Colors.transparent : xc.primary,
                    ),
                  ),
                  title: Text(n.title,
                      style: XType.body.copyWith(
                        color: xc.textPrimary,
                        fontWeight: n.read ? FontWeight.w500 : FontWeight.w700,
                      )),
                  subtitle: Text(n.body,
                      style: XType.caption.copyWith(color: xc.textSecondary)),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
