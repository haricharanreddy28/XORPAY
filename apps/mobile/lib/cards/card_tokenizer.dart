import 'dart:math';

import 'package:xorpay_ui/xorpay_ui.dart';

/// Raw card details entered by the user. These live ONLY in memory on the
/// device and are passed ONLY to a [CardTokenizer]. They are never sent to the
/// XORPAY backend, never logged, never persisted.
class CardDetails {
  const CardDetails({
    required this.number,
    required this.expiryMonth,
    required this.expiryYear,
    required this.cvv,
    this.holderName,
  });

  final String number; // PAN — stays on device
  final int expiryMonth;
  final int expiryYear;
  final String cvv; // never stored
  final String? holderName;
}

/// The tokenised result — safe to send to our backend.
class CardToken {
  const CardToken({
    required this.token,
    required this.last4,
    required this.network,
    required this.expiryMonth,
    required this.expiryYear,
  });

  final String token;
  final String last4;
  final String network; // e.g. 'visa'
  final int expiryMonth;
  final int expiryYear;
}

/// Turns raw card details into a PSP token. The real implementation hands the
/// PAN directly to the PSP (Cashfree) via its secure SDK/fields and gets back
/// a Card-on-File token — the PAN never reaches our servers (RBI CoF, PCI-DSS).
abstract class CardTokenizer {
  Future<CardToken> tokenize(CardDetails details);
}

/// Dev tokenizer: generates a fake token locally. It deliberately keeps the
/// PAN/CVV on-device (uses only the last 4 for display) and transmits nothing.
/// Swap for [CashfreeCardTokenizer] once the PSP SDK is wired.
class StubCardTokenizer implements CardTokenizer {
  @override
  Future<CardToken> tokenize(CardDetails d) async {
    final digits = d.number.replaceAll(RegExp(r'\D'), '');
    final rnd = Random().nextInt(1 << 32).toRadixString(16);
    return CardToken(
      token: 'tok_stub_$rnd',
      last4: digits.length >= 4 ? digits.substring(digits.length - 4) : digits,
      network: detectCardNetwork(digits).name,
      expiryMonth: d.expiryMonth,
      expiryYear: d.expiryYear,
    );
  }
}

/// Placeholder for the real Cashfree card tokenisation. Wire this to the
/// Cashfree SDK's secure card capture in a later slice, then make it the
/// default tokenizer. It must take the PAN directly to Cashfree, not via us.
class CashfreeCardTokenizer implements CardTokenizer {
  @override
  Future<CardToken> tokenize(CardDetails details) {
    throw UnimplementedError('Wire Cashfree card tokenisation SDK here.');
  }
}
