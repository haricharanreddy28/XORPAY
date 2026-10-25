import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'support_service.dart';

/// A support ticket thread with a reply box.
class TicketDetailScreen extends StatefulWidget {
  const TicketDetailScreen({super.key, required this.id});
  final String id;

  @override
  State<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends State<TicketDetailScreen> {
  late Future<Ticket> _ticket;
  final _reply = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _ticket = SupportService.instance.get(widget.id);
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_reply.text.trim().isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final updated = await SupportService.instance.reply(widget.id, _reply.text.trim());
      _reply.clear();
      setState(() {
        _ticket = Future.value(updated);
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Ticket')),
      body: Column(
        children: [
          Expanded(
            child: FutureBuilder<Ticket>(
              future: _ticket,
              builder: (context, snap) {
                if (!snap.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                final t = snap.data!;
                return ListView(
                  padding: const EdgeInsets.all(XSpacing.xl),
                  children: [
                    Text(t.subject, style: XType.h3.copyWith(color: xc.textPrimary)),
                    const SizedBox(height: XSpacing.lg),
                    for (final m in t.messages)
                      Align(
                        alignment: m.from == 'user'
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: XSpacing.sm),
                          padding: const EdgeInsets.all(XSpacing.md),
                          decoration: BoxDecoration(
                            color: m.from == 'user' ? xc.primary : xc.bgSurface,
                            borderRadius: BorderRadius.circular(XRadius.card),
                            border: Border.all(color: xc.border),
                          ),
                          child: Text(m.body,
                              style: XType.body.copyWith(
                                  color: m.from == 'user'
                                      ? Colors.white
                                      : xc.textPrimary)),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(XSpacing.md),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _reply,
                      decoration: const InputDecoration(labelText: 'Reply'),
                    ),
                  ),
                  const SizedBox(width: XSpacing.sm),
                  IconButton(
                    icon: Icon(Icons.send, color: xc.primary),
                    onPressed: _busy ? null : _send,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
