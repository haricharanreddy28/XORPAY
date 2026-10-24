function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\s().-]/g, "");
  if (/^[6-9]\d{9}$/.test(phone)) return "+91" + phone;
  if (/^91[6-9]\d{9}$/.test(phone)) return "+" + phone;
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone;
  return null;
}

export const pilotMode = process.env.PILOT_MODE === "true";
export const pilotAllowedPhones = new Set(
  (process.env.PILOT_ALLOWLIST_PHONES || "")
    .split(",")
    .map(normalizePhone)
    .filter(Boolean),
);
export const pilotAllowedCategories = new Set(
  (process.env.PILOT_ALLOWED_CATEGORIES || "vendor,rent")
    .split(",")
    .map((category) => category.trim().toLowerCase())
    .filter(Boolean),
);

function capFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export const pilotCaps = Object.freeze({
  perTxn: capFromEnv("PILOT_MAX_TRANSACTION_MINOR", 500_000),
  daily: capFromEnv("PILOT_MAX_DAILY_MINOR", 1_000_000),
  monthly: capFromEnv("PILOT_MAX_MONTHLY_MINOR", 5_000_000),
  maxUsers: capFromEnv("PILOT_MAX_USERS", 10),
});

if (pilotMode && pilotAllowedPhones.size > pilotCaps.maxUsers) {
  throw new Error("PILOT_ALLOWLIST_PHONES exceeds PILOT_MAX_USERS");
}

export function pilotAccessAllowed(phone) {
  return !pilotMode || pilotAllowedPhones.has(phone);
}

export function pilotCategoryAllowed(category) {
  return !pilotMode || pilotAllowedCategories.has(String(category || "").toLowerCase());
}
