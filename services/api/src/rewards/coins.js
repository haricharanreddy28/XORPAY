// Coins rule engine (spec §3.6). Pure + unit-tested. Rewards are earned per
// transaction: a base rate per ₹100 paid, a category multiplier, a first-
// transaction bonus, and a card-network bonus. Amounts in paise.

export const DEFAULT_RULES = Object.freeze({
  coinsPerHundredRupees: 1,
  categoryMultiplier: {
    vendor: 1,
    rent: 2, // promote rent
    gst: 1,
    tax: 1,
    education: 1,
    card_bill: 1,
    invoice: 1,
  },
  firstTransactionBonus: 50,
  networkBonus: { rupay: 5 }, // promote RuPay
});

/**
 * @param {{payeeMinor:number, category?:string, cardNetwork?:string, isFirstTxn?:boolean}} txn
 * @returns {number} coins earned
 */
export function computeCoins(
  { payeeMinor, category = "vendor", cardNetwork = "other", isFirstTxn = false },
  rules = DEFAULT_RULES,
) {
  if (!(payeeMinor > 0)) return 0;
  const hundreds = Math.floor(payeeMinor / 10_000); // number of ₹100 units
  const mult = rules.categoryMultiplier[category] ?? 1;
  let coins = hundreds * rules.coinsPerHundredRupees * mult;
  if (isFirstTxn) coins += rules.firstTransactionBonus;
  coins += rules.networkBonus[cardNetwork] ?? 0;
  return coins;
}
