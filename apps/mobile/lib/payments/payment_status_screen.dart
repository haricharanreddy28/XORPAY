import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'payment_service.dart';

/// Shows an animated success/pending/failed state after a payment attempt.
/// Drop Lottie JSON files into assets/animations/ and reference them here.
class PaymentStatusScreen extends StatelessWidget {
  const PaymentStatusScreen({super.key, required this.result});
  final PaymentResult result;

  ({String title, String? asset, IconData fallback, Color color}) get _view {
    switch (result.status) {
      case PaymentStatus.success:
        return (
          title: 'Payment successful',
          asset: 'assets/animations/success.json',
          fallback: Icons.check_circle,
          color: Colors.green,
        );
      case PaymentStatus.pending:
        return (
          title: 'Payment pending',
          asset: 'assets/animations/pending.json',
          fallback: Icons.hourglass_top,
          color: Colors.orange,
        );
      case PaymentStatus.failed:
        return (
          title: 'Payment failed',
          asset: 'assets/animations/failed.json',
          fallback: Icons.cancel,
          color: Colors.red,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = _view;
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 160,
                child: _Animation(asset: v.asset, fallback: v.fallback, color: v.color),
              ),
              const SizedBox(height: 16),
              Text(v.title, style: Theme.of(context).textTheme.titleLarge),
              if (result.reference != null) ...[
                const SizedBox(height: 8),
                Text('Ref: ${result.reference}',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
              if (result.message != null) ...[
                const SizedBox(height: 8),
                Text(result.message!, textAlign: TextAlign.center),
              ],
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                child: const Text('Done'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Uses a Lottie animation if present, else a plain icon so it works
/// before you add animation assets.
class _Animation extends StatelessWidget {
  const _Animation({this.asset, required this.fallback, required this.color});
  final String? asset;
  final IconData fallback;
  final Color color;

  @override
  Widget build(BuildContext context) {
    if (asset == null) return Icon(fallback, size: 96, color: color);
    return Lottie.asset(
      asset!,
      errorBuilder: (_, __, ___) => Icon(fallback, size: 96, color: color),
    );
  }
}
