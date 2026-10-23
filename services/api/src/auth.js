// Auth helpers. DEV ONLY token scheme (base64 of phone) — replace with real
// JWT/session + device binding before production (see spec §6).

export const makeToken = (phone) => Buffer.from(phone).toString("base64");

export const phoneFromToken = (t) => {
  try {
    return Buffer.from(t, "base64").toString("utf8");
  } catch {
    return null;
  }
};

/// Express middleware: requires a Bearer token, sets req.phone, else 401.
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const phone = token && phoneFromToken(token);
  if (!phone) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.phone = phone;
  next();
}
