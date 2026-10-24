import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'support_service.dart';
import 'ticket_detail_screen.dart';

/// Help & support (spec §3.9): FAQs, raise a ticket, and your ticket list.
class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

const _faqs = [
  ('How long do payments take?', 'Most payouts are credited within 2 hours.'),
  ('Are my card details safe?', 'Yes — cards are tokenised by our payment partner; XORPAY never stores your card number or CVV.'),
  ('What are the fees?', 'A small platform fee plus 18% GST on the fee, shown before you pay.'),
  ('How do I earn coins?', 'You earn coins on every payment; redeem them for fee discounts.'),
];

class _SupportScreenState extends State<SupportScreen> {
  late Future<List<Ticket>> _tickets;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() => setState(() => _tickets = SupportService.instance.list());

  Future<void> _raise() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.xc.bgElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(XRadius.sheet)),
      ),
      builder: (_) => const _RaiseTicketSheet(),
    );
    if (created == true) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(title: const Text('Help & support')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _raise,
        icon: const Icon(Icons.support_agent),
        label: const Text('Contact us'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(XSpacing.xl),
        children: [
          Text('FAQs', style: XType.h3.copyWith(color: xc.textPrimary)),
          const SizedBox(height: XSpacing.sm),
          for (final f in _faqs)
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                title: Text(f.$1, style: XType.body.copyWith(color: xc.textPrimary)),
                childrenPadding: const EdgeInsets.only(bottom: XSpacing.md),
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(f.$2,
                        style: XType.caption.copyWith(color: xc.textSecondary)),
                  ),
                ],
              ),
            ),
          const SizedBox(height: XSpacing.xl),
          Text('Your tickets', style: XType.h3.copyWith(color: xc.textPrimary)),
          const SizedBox(height: XSpacing.sm),
          FutureBuilder<List<Ticket>>(
            future: _tickets,
            builder: (context, snap) {
              final tickets = snap.data ?? const [];
              if (tickets.isEmpty) {
                return Text('No tickets yet.',
                    style: XType.body.copyWith(color: xc.textSecondary));
              }
              return Column(
                children: [
                  for (final t in tickets)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                          t.isDispute ? Icons.gavel_outlined : Icons.chat_bubble_outline,
                          color: xc.primary),
                      title: Text(t.subject,
                          style: XType.body.copyWith(color: xc.textPrimary)),
                      subtitle: Text(t.status,
                          style: XType.caption.copyWith(color: xc.textMuted)),
                      onTap: () async {
                        await Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => TicketDetailScreen(id: t.id),
                        ));
                        _reload();
                      },
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _RaiseTicketSheet extends StatefulWidget {
  const _RaiseTicketSheet();
  @override
  State<_RaiseTicketSheet> createState() => _RaiseTicketSheetState();
}

class _RaiseTicketSheetState extends State<_RaiseTicketSheet> {
  final _subject = TextEditingController();
  final _body = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_subject.text.trim().isEmpty || _body.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await SupportService.instance
          .create(subject: _subject.text.trim(), body: _body.text.trim());
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: XSpacing.xl,
        right: XSpacing.xl,
        top: XSpacing.lg,
        bottom: MediaQuery.of(context).viewInsets.bottom + XSpacing.xl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _subject,
            decoration: const InputDecoration(labelText: 'Subject'),
          ),
          const SizedBox(height: XSpacing.md),
          TextField(
            controller: _body,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'How can we help?'),
          ),
          const SizedBox(height: XSpacing.lg),
          XButton(label: 'Submit', loading: _busy, onPressed: _submit),
        ],
      ),
    );
  }
}
