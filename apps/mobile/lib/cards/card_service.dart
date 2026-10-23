import 'package:xorpay_ui/xorpay_ui.dart';

import '../core/api_client.dart';
import 'card_tokenizer.dart';

/// A saved card as the backend returns it — token reference only, no PAN.
class SavedCard {
  const SavedCard({
    required this.id,
    required this.last4,
    required this.network,
    this.issuer,
    this.expiryMonth,
    this.expiryYear,
  });

  final String id;
  final String last4;
  final String network;
  final String? issuer;
  final int? expiryMonth;
  final int? expiryYear;

  CardNetwork get networkEnum => CardNetwork.values.firstWhere(
        (n) => n.name == network,
        orElse: () => CardNetwork.other,
      );

  String? get expiry => (expiryMonth != null && expiryYear != null)
      ? '${expiryMonth.toString().padLeft(2, '0')}/${expiryYear! % 100}'
      : null;

  factory SavedCard.fromJson(Map<String, dynamic> j) => SavedCard(
        id: j['id'] as String,
        last4: j['last4'] as String,
        network: (j['network'] as String?) ?? 'other',
        issuer: j['issuer'] as String?,
        expiryMonth: (j['expiryMonth'] as num?)?.toInt(),
        expiryYear: (j['expiryYear'] as num?)?.toInt(),
      );
}

class CardService {
  CardService._();
  static final CardService instance = CardService._();

  final _dio = ApiClient.instance.dio;

  Future<List<SavedCard>> list() async {
    final res = await _dio.get('/cards');
    final cards = (res.data['cards'] as List?) ?? [];
    return cards
        .map((c) => SavedCard.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  /// Sends ONLY the token + display metadata — never the PAN/CVV.
  Future<SavedCard> add(CardToken token, {String? issuer}) async {
    final res = await _dio.post('/cards', data: {
      'token': token.token,
      'last4': token.last4,
      'network': token.network,
      'issuer': issuer,
      'expiryMonth': token.expiryMonth,
      'expiryYear': token.expiryYear,
    });
    return SavedCard.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> remove(String id) => _dio.delete('/cards/$id');
}
