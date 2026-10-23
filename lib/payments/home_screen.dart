import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../auth/session.dart';
import 'payment_service.dart';
import 'payment_status_screen.dart';
import 'qr_scan_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Future<void> _scanAndPay(BuildContext context) async {
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QrScanScreen()),
    );
    if (raw == null || !context.mounted) return;

    final upi = UpiPayload.tryParse(raw);
    final messenger = ScaffoldMessenger.of(context);
    if (upi?.payeeVpa == null) {
      messenger.showSnackBar(const SnackBar(content: Text('Not a valid UPI QR')));
      return;
    }

    // Demo amount: 1 rupee = 100 paise. Real flow collects the amount.
    final order = await PaymentService.instance.createOrder(
      amountMinor: 100,
      metadata: {'payee': upi!.payeeVpa},
    );
    final result = await PaymentService.instance.payWithOrder(order);

    if (!context.mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => PaymentStatusScreen(result: result)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Xorpay'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<Session>().logout(),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Balance', style: Theme.of(context).textTheme.labelMedium),
                    const SizedBox(height: 4),
                    Text('₹ —', style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 4),
                    Text('Wire up GET /account/balance',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => _scanAndPay(context),
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan & Pay'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.history),
              label: const Text('Transactions'),
            ),
          ],
        ),
      ),
    );
  }
}
