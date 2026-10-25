import 'package:flutter/material.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import '../payments/payment_service.dart';
import '../receipts/receipt.dart';
import 'invoice_service.dart';

/// GST Hub (spec §3.4.6): import supplier invoices from GSTR-2A/2B, list them
/// grouped by supplier, multi-select, toggle TDS, and pay the selection via the
/// shared payment flow. The selection's net is quoted server-side at pay time.
class GstHubScreen extends StatefulWidget {
  const GstHubScreen({super.key});

  @override
  State<GstHubScreen> createState() => _GstHubScreenState();
}

class _GstHubScreenState extends State<GstHubScreen> {
  late Future<List<Invoice>> _invoices;
  final _selected = <String>{};
  List<Invoice> _loaded = const [];
  bool _withTds = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _invoices = InvoiceService.instance.list();
    });
  }

  Future<void> _import() async {
    setState(() => _busy = true);
    try {
      await InvoiceService.instance.pull();
      _selected.clear();
      _reload();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // Client-side preview totals (backend re-quotes authoritatively at pay time).
  int get _grossMinor =>
      _loaded.where((i) => _selected.contains(i.id)).fold(0, (s, i) => s + i.amountMinor);
  int get _tdsMinor => _withTds
      ? _loaded
          .where((i) => _selected.contains(i.id))
          .fold(0, (s, i) => s + (i.amountMinor * InvoiceService.tdsRatePct / 100).round())
      : 0;
  int get _netMinor => _grossMinor - _tdsMinor;

  Future<void> _pay() async {
    if (_selected.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final ids = _selected.toList();
      final quote = await InvoiceService.instance.quote(ids, withTds: _withTds);
      final order = await PaymentService.instance.createOrder(
        amountMinor: quote.netMinor,
        category: 'invoice',
        metadata: {'invoiceIds': ids, 'withTds': _withTds},
      );
      final result = await PaymentService.instance.payWithOrder(order);
      final paidOk = result.status == PaymentStatus.success ||
          result.status == PaymentStatus.pending;
      if (paidOk) await InvoiceService.instance.markPaid(ids, txnId: order.orderId);
      if (!mounted) return;
      final supplierNames =
          _loaded.where((i) => ids.contains(i.id)).map((i) => i.supplierName).toSet();
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => ReceiptScreen(
          result: result,
          order: order,
          payeeName: supplierNames.length == 1
              ? supplierNames.first
              : '${ids.length} invoices',
          category: 'invoice',
          payeeAmount: quote.netMinor / 100,
        ),
      ));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Couldn’t start this payment.')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Scaffold(
      appBar: AppBar(
        title: const Text('GST Hub'),
        actions: [
          TextButton(
            onPressed: _busy ? null : _import,
            child: Text('Import', style: XType.body.copyWith(color: xc.primary)),
          ),
        ],
      ),
      body: FutureBuilder<List<Invoice>>(
        future: _invoices,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          _loaded = snap.data ?? const [];
          if (_loaded.isEmpty) return _empty(xc);
          return _list(xc);
        },
      ),
      bottomNavigationBar: _selected.isEmpty ? null : _payBar(xc),
    );
  }

  Widget _empty(XColors xc) => Center(
        child: Padding(
          padding: const EdgeInsets.all(XSpacing.xxxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.inventory_2_outlined, size: 64, color: xc.textMuted),
              const SizedBox(height: XSpacing.lg),
              Text('No unpaid invoices',
                  style: XType.h3.copyWith(color: xc.textPrimary)),
              const SizedBox(height: XSpacing.xs),
              Text('Import your purchases from GSTR-2B.',
                  style: XType.body.copyWith(color: xc.textSecondary)),
              const SizedBox(height: XSpacing.xl),
              XButton(label: 'Import from GSTR-2B', loading: _busy, onPressed: _import),
            ],
          ),
        ),
      );

  Widget _list(XColors xc) {
    // Group by supplier for section headers.
    final groups = <String, List<Invoice>>{};
    for (final inv in _loaded) {
      groups.putIfAbsent(inv.supplierName, () => []).add(inv);
    }
    final suppliers = groups.keys.toList();

    return ListView.builder(
      padding: const EdgeInsets.only(bottom: XSpacing.xxl),
      itemCount: suppliers.length,
      itemBuilder: (context, i) {
        final name = suppliers[i];
        final invs = groups[name]!;
        final supplierTotal = invs.fold(0, (s, x) => s + x.amountMinor);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  XSpacing.xl, XSpacing.lg, XSpacing.xl, XSpacing.xs),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(name,
                      style: XType.body.copyWith(
                          color: xc.textPrimary, fontWeight: FontWeight.w700)),
                  Text(XMoney.fromMinor(supplierTotal),
                      style: XType.caption.copyWith(color: xc.textMuted)),
                ],
              ),
            ),
            for (final inv in invs)
              CheckboxListTile(
                value: _selected.contains(inv.id),
                onChanged: (v) => setState(() {
                  if (v == true) {
                    _selected.add(inv.id);
                  } else {
                    _selected.remove(inv.id);
                  }
                }),
                title: Text('Invoice ${inv.invoiceNo}',
                    style: XType.body.copyWith(color: xc.textPrimary)),
                subtitle: Text(inv.invoiceDate,
                    style: XType.caption.copyWith(color: xc.textMuted)),
                secondary: Text(XMoney.fromMinor(inv.amountMinor),
                    style: XType.body.copyWith(
                        color: xc.textPrimary, fontWeight: FontWeight.w600)),
                controlAffinity: ListTileControlAffinity.leading,
              ),
          ],
        );
      },
    );
  }

  Widget _payBar(XColors xc) {
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.all(XSpacing.lg),
        decoration: BoxDecoration(
          color: xc.bgElevated,
          border: Border(top: BorderSide(color: xc.border)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Deduct TDS (${InvoiceService.tdsRatePct}%)',
                      style: XType.body.copyWith(color: xc.textPrimary)),
                ),
                Switch(
                  value: _withTds,
                  onChanged: (v) => setState(() => _withTds = v),
                ),
              ],
            ),
            if (_withTds)
              Padding(
                padding: const EdgeInsets.only(bottom: XSpacing.sm),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Gross ${XMoney.fromMinor(_grossMinor)} · TDS ${XMoney.fromMinor(_tdsMinor)}',
                        style: XType.caption.copyWith(color: xc.textMuted)),
                  ],
                ),
              ),
            XButton(
              label: 'Pay ${XMoney.fromMinor(_netMinor)} for ${_selected.length} invoice${_selected.length == 1 ? '' : 's'}',
              loading: _busy,
              onPressed: _pay,
            ),
          ],
        ),
      ),
    );
  }
}
