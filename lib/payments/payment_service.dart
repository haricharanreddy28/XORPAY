import 'dart:async';

import 'package:flutter_cashfree_pg_sdk/api/cfpayment/cfdropcheckoutpayment.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpaymentgateway/cfpaymentgatewayservice.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfsession/cfsession.dart';
import 'package:flutter_cashfree_pg_sdk/api/cferrorresponse/cferrorresponse.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfenums.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfexceptions.dart';

import '../core/api_client.dart';
import '../core/config.dart';

/// Result of a payment attempt.
enum PaymentStatus { success, pending, failed }

class PaymentResult {
  const PaymentResult(this.status, {this.reference, this.message});
  final PaymentStatus status;
  final String? reference;
  final String? message;
}

/// Handle returned by your backend after it creates a Cashfree order.
/// `paymentSessionId` is what the Cashfree SDK needs to open checkout.
class OrderHandle {
  const OrderHandle({required this.orderId, required this.paymentSessionId});
  final String orderId;
  final String paymentSessionId;
}

/// Cashfree-backed payment flow.
///
/// Trust boundary (do not break this):
///   1. Client asks YOUR backend to create an order.
///   2. Backend calls Cashfree with its SECRET key -> returns order_id +
///      payment_session_id. The secret key never touches the app.
///   3. Client opens Cashfree Drop checkout with the payment_session_id.
///   4. On the SDK's verify callback, the client asks YOUR backend to confirm.
///   5. Backend calls Cashfree's Get-Order API (secret key) and trusts THAT,
///      not the client, before marking the order paid.
///
/// NOTE: Cashfree's SDK surface changes across major versions. These class and
/// method names target flutter_cashfree_pg_sdk ^2.2.x — if `flutter pub get`
/// pulls a different major, re-check the builder/callback names against the
/// package's current README.
class PaymentService {
  PaymentService._() {
    // Register global callbacks once; each payment swaps in a fresh completer.
    _gateway.setCallback(_onVerify, _onError);
  }
  static final PaymentService instance = PaymentService._();

  final CFPaymentGatewayService _gateway = CFPaymentGatewayService();
  Completer<PaymentResult>? _pending;

  /// Step 1–2: create a Cashfree order via your backend.
  Future<OrderHandle> createOrder({
    required int amountMinor, // paise; backend converts to Cashfree's rupees
    String currency = 'INR',
    Map<String, dynamic>? metadata,
  }) async {
    final res = await ApiClient.instance.dio.post('/payments/orders', data: {
      'amount': amountMinor,
      'currency': currency,
      if (metadata != null) 'metadata': metadata,
    });
    return OrderHandle(
      orderId: res.data['order_id'] as String,
      paymentSessionId: res.data['payment_session_id'] as String,
    );
  }

  /// Step 3: open Cashfree Drop checkout. Completes when the SDK calls back.
  Future<PaymentResult> payWithOrder(OrderHandle order) {
    // Guard against overlapping payments.
    if (_pending != null && !_pending!.isCompleted) {
      return Future.value(const PaymentResult(
        PaymentStatus.failed,
        message: 'A payment is already in progress.',
      ));
    }
    final completer = Completer<PaymentResult>();
    _pending = completer;

    try {
      final session = CFSessionBuilder()
          .setEnvironment(AppConfig.cashfreeIsProduction
              ? CFEnvironment.PRODUCTION
              : CFEnvironment.SANDBOX)
          .setOrderId(order.orderId)
          .setPaymentSessionId(order.paymentSessionId)
          .build();

      final payment =
          CFDropCheckoutPaymentBuilder().setSession(session).build();

      // Opens the checkout UI; result arrives via _onVerify / _onError.
      _gateway.doPayment(payment);
    } on CFException catch (e) {
      completer.complete(
          PaymentResult(PaymentStatus.failed, message: e.message));
    }
    return completer.future;
  }

  /// SDK says the flow finished for [orderId] — confirm server-side.
  Future<void> _onVerify(String orderId) async {
    try {
      final result = await confirmOrder(orderId);
      _complete(result);
    } catch (e) {
      // UI finished but our confirm failed/timed out: treat as pending, not paid.
      _complete(PaymentResult(
        PaymentStatus.pending,
        reference: orderId,
        message: 'Awaiting confirmation. Reconcile via webhook/backend.',
      ));
    }
  }

  void _onError(CFErrorResponse error, String orderId) {
    _complete(PaymentResult(
      PaymentStatus.failed,
      reference: orderId,
      message: error.getMessage(),
    ));
  }

  void _complete(PaymentResult r) {
    final c = _pending;
    if (c != null && !c.isCompleted) c.complete(r);
    _pending = null;
  }

  /// Step 4–5: backend confirms the order's real status with Cashfree.
  /// Never trust the client/SDK alone for "paid".
  Future<PaymentResult> confirmOrder(String orderId) async {
    final res = await ApiClient.instance.dio
        .post('/payments/confirm', data: {'order_id': orderId});
    final status = (res.data['status'] as String? ?? '').toUpperCase();
    final mapped = switch (status) {
      'PAID' || 'SUCCESS' => PaymentStatus.success,
      'ACTIVE' || 'PENDING' => PaymentStatus.pending,
      _ => PaymentStatus.failed,
    };
    return PaymentResult(mapped, reference: orderId, message: status);
  }
}
