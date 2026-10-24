import '../core/api_client.dart';

class RewardEntry {
  const RewardEntry({required this.coins, required this.reason, required this.at});
  final int coins;
  final String reason;
  final DateTime at;

  String get label => switch (reason) {
        'payment' => 'Payment reward',
        'referral_invited' => 'Referral bonus',
        'referral_joined' => 'Welcome bonus',
        _ => 'Reward',
      };

  factory RewardEntry.fromJson(Map<String, dynamic> j) => RewardEntry(
        coins: (j['coins'] as num?)?.toInt() ?? 0,
        reason: (j['reason'] as String?) ?? 'reward',
        at: DateTime.fromMillisecondsSinceEpoch((j['at'] as num?)?.toInt() ?? 0),
      );
}

class Rewards {
  const Rewards({required this.balance, required this.history});
  final int balance;
  final List<RewardEntry> history;

  factory Rewards.fromJson(Map<String, dynamic> j) => Rewards(
        balance: (j['balance'] as num?)?.toInt() ?? 0,
        history: ((j['history'] as List?) ?? [])
            .map((e) => RewardEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class Referral {
  const Referral({
    required this.code,
    required this.referralsCount,
    required this.rewardCoins,
    this.referredBy,
  });
  final String code;
  final int referralsCount;
  final int rewardCoins;
  final String? referredBy;

  factory Referral.fromJson(Map<String, dynamic> j) => Referral(
        code: (j['code'] as String?) ?? '',
        referralsCount: (j['referralsCount'] as num?)?.toInt() ?? 0,
        rewardCoins: (j['rewardCoins'] as num?)?.toInt() ?? 0,
        referredBy: j['referredBy'] as String?,
      );
}

class RewardsService {
  RewardsService._();
  static final RewardsService instance = RewardsService._();

  final _dio = ApiClient.instance.dio;

  Future<Rewards> getRewards() async {
    final res = await _dio.get('/rewards');
    return Rewards.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Referral> getReferral() async {
    final res = await _dio.get('/referrals');
    return Referral.fromJson(res.data as Map<String, dynamic>);
  }

  /// Redeem a referral code; returns coins earned.
  Future<int> redeem(String code) async {
    final res = await _dio.post('/referrals/redeem', data: {'code': code});
    return (res.data['rewardCoins'] as num?)?.toInt() ?? 0;
  }
}
