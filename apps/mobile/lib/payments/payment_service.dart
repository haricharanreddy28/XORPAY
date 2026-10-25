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
  const OrderHandle({
    required this.orderId,
    required this.paymentSessionId,
    this.fee,
  });
  final String orderId;
  final String paymentSessionId;

  /// Authoritative fee breakdown from the server (paise). Keys: payeeMinor,
  /// feeMinor, gstMinor, chargeMinor, youPayMinor.
  final Map<String, dynamic>? fee;
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
  /// [amountMinor] is what the beneficiary receives; the server adds the fee
  /// and returns the authoritative breakdown.
  Future<OrderHandle> createOrder({
    required int amountMinor, // paise (payee amount)
    String currency = 'INR',
    String? category, // 'vendor' | 'rent' | ...
    String? beneficiaryId,
    bool beneficiaryVerified = true,
    Map<String, dynamic>? metadata,
  }) async {
    final res = await ApiClient.instance.dio.post('/payments/orders', data: {
      'amount': amountMinor,
      'currency': currency,
      'beneficiaryVerified': beneficiaryVerified,
      if (category != null) 'category': category,
      if (beneficiaryId != null) 'beneficiaryId': beneficiaryId,
      if (metadata != null) 'metadata': metadata,
    });
    return OrderHandle(
      orderId: res.data['order_id'] as String,
      paymentSessionId: res.data['payment_session_id'] as String,
      fee: (res.data['fee'] as Map?)?.cast<String, dynamic>(),
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

      // ignore: deprecated_member_use
      final payment = CFDropCheckoutPaymentBuilder().setSession(session).build();

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
      final result = await _confirmAfterCheckout(orderId);
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

  Future<void> _onError(CFErrorResponse error, String orderId) async {
    // SDK errors aren't authoritative. The bank may have approved the payment
    // even if checkout was interrupted, so reconcile with the server first.
    try {
      final result = await _confirmAfterCheckout(orderId);
      if (result.status == PaymentStatus.success ||
          result.status == PaymentStatus.pending) {
        _complete(result);
      } else {
        _complete(PaymentResult(
          PaymentStatus.failed,
          reference: orderId,
          message: result.message ?? error.getMessage(),
        ));
      }
    } catch (_) {
      _complete(PaymentResult(
        PaymentStatus.pending,
        reference: orderId,
        message: 'Payment status is being confirmed. Check transactions shortly.',
      ));
    }
  }

  void _complete(PaymentResult r) {
    final c = _pending;
    if (c != null && !c.isCompleted) c.complete(r);
    _pending = null;
  }

  Future<PaymentResult> _confirmAfterCheckout(String orderId) async {
    // Cashfree can report a short-lived pending/active state immediately
    // after returning from the SDK. Poll the server briefly; it checks
    // Cashfree's order and payment-attempt APIs on every request.
    PaymentResult result = PaymentResult(
      PaymentStatus.pending,
      reference: orderId,
      message: 'Payment status is being confirmed.',
    );
    for (var attempt = 0; attempt < 5; attempt++) {
      result = await confirmOrder(orderId);
      if (result.status != PaymentStatus.pending || attempt == 4) break;
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    return result;
  }

  /// Step 4–5: backend confirms the order's real status with Cashfree.
  /// Never trust the client/SDK alone for "paid".
  Future<PaymentResult> confirmOrder(String orderId) async {
    final res = await ApiClient.instance.dio
        .post('/payments/confirm', data: {'order_id': orderId});
    final status = (res.data['status'] as String? ?? '').toUpperCase();
    final mapped = switch (status) {
      'PAID' || 'SUCCESS' => PaymentStatus.success,
      'ACTIVE' || 'PENDING' || '' => PaymentStatus.pending,
      'FAILED' || 'EXPIRED' || 'USER_DROPPED' => PaymentStatus.failed,
      _ => PaymentStatus.pending,
    };
    return PaymentResult(mapped, reference: orderId, message: status);
  }
}
