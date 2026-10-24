import crypto from "node:crypto";
import { getDatabase, databaseConfigured } from "../db/database.js";
import {
  addNotification,
  listNotifications as listMemoryNotifications,
  markNotificationRead as markMemoryNotificationRead,
} from "../store.js";
import { decryptKycValue, encryptKycValue } from "../kyc/kycCrypto.js";

const devContacts = new Map();
const devDevices = new Map();

function maskEmail(value) {
  if (!value) return null;
  const [local, domain] = value.split("@");
  if (!domain) return null;
  return `${local.slice(0, 1)}${"•".repeat(Math.min(Math.max(local.length - 1, 2), 8))}@${domain}`;
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function createNotification(phone, { title, body, type }) {
  if (!databaseConfigured()) return addNotification(phone, { title, body, type });
  const result = await getDatabase().query(
    "INSERT INTO xorpay_notifications(user_phone,title,body,type) VALUES($1,$2,$3,$4) " +
    "RETURNING id,title,body,type,created_at,read_at",
    [phone, title.slice(0, 120), body.slice(0, 2000), type.slice(0, 40)],
  );
  const row = result.rows[0];
  return { id: row.id, title: row.title, body: row.body, type: row.type, at: row.created_at.getTime(), read: false };
}

export async function listNotifications(phone) {
  if (!databaseConfigured()) return listMemoryNotifications(phone);
  const result = await getDatabase().query(
    "SELECT id,title,body,type,created_at,read_at FROM xorpay_notifications " +
    "WHERE user_phone=$1 ORDER BY created_at DESC LIMIT 200",
    [phone],
  );
  return result.rows.map((row) => ({
    id: row.id, title: row.title, body: row.body, type: row.type,
    at: row.created_at.getTime(), read: Boolean(row.read_at),
  }));
}

export async function markNotificationRead(phone, id) {
  if (!databaseConfigured()) return markMemoryNotificationRead(phone, id);
  await getDatabase().query(
    "UPDATE xorpay_notifications SET read_at=COALESCE(read_at,now()) WHERE user_phone=$1 AND id=$2",
    [phone, id],
  );
}

export async function issueEmailChallenge(phone, email, codeHash) {
  const encrypted = encryptKycValue(email, phone, "email");
  if (!databaseConfigured()) {
    const entry = devContacts.get(phone) || { preferences: { sms: false, email: false, push: false }, verifyAttempts: 0 };
    const now = Date.now();
    if (entry.sentAt && now - entry.sentAt < 60_000) return false;
    if (entry.windowAt && now - entry.windowAt < 3_600_000 && (entry.sendCount || 0) >= 5) return false;
    entry.emailCiphertext = encrypted.ciphertext;
    entry.emailKeyId = encrypted.keyId;
    entry.emailVerified = false;
    entry.verifyAttempts = 0;
    entry.codeHash = codeHash;
    entry.expiresAt = now + 10 * 60_000;
    entry.sentAt = now;
    entry.sendCount = entry.windowAt && now - entry.windowAt < 3_600_000 ? (entry.sendCount || 0) + 1 : 1;
    entry.windowAt = entry.windowAt && now - entry.windowAt < 3_600_000 ? entry.windowAt : now;
    devContacts.set(phone, entry);
    return true;
  }

  const db = getDatabase();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO xorpay_notification_contacts(user_phone) VALUES($1) ON CONFLICT DO NOTHING", [phone]);
    const current = await client.query(
      "SELECT email_otp_sent_at,email_otp_window_started_at,email_otp_send_count " +
      "FROM xorpay_notification_contacts WHERE user_phone=$1 FOR UPDATE",
      [phone],
    );
    const row = current.rows[0];
    const now = Date.now();
    if (row.email_otp_sent_at && now - new Date(row.email_otp_sent_at).getTime() < 60_000) {
      await client.query("ROLLBACK");
      return false;
    }
    const withinWindow = row.email_otp_window_started_at &&
      now - new Date(row.email_otp_window_started_at).getTime() < 3_600_000;
    if (withinWindow && row.email_otp_send_count >= 5) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      "UPDATE xorpay_notification_contacts SET email_hash=$2,email_ciphertext=$3,email_key_id=$4," +
      "email_verified_at=NULL,email_otp_hash=$5,email_otp_expires_at=now()+interval '10 minutes'," +
      "email_otp_sent_at=now(),email_otp_window_started_at=$6,email_otp_send_count=$7,email_otp_attempts=0 WHERE user_phone=$1",
      [phone, hash(email.toLowerCase()), encrypted.ciphertext, encrypted.keyId, codeHash,
        withinWindow ? row.email_otp_window_started_at : new Date(), withinWindow ? row.email_otp_send_count + 1 : 1],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function clearEmailChallenge(phone) {
  if (!databaseConfigured()) {
    const entry = devContacts.get(phone);
    if (entry) { entry.codeHash = null; entry.expiresAt = 0; entry.sentAt = 0; }
    return;
  }
  await getDatabase().query(
    "UPDATE xorpay_notification_contacts SET email_otp_hash=NULL,email_otp_expires_at=NULL,email_otp_sent_at=NULL WHERE user_phone=$1",
    [phone],
  );
}

export async function verifyEmailChallenge(phone, codeHash) {
  if (!databaseConfigured()) {
    const entry = devContacts.get(phone);
    if (!entry || !entry.codeHash || entry.expiresAt < Date.now() || entry.verifyAttempts >= 5) return false;
    if (entry.codeHash.length !== codeHash.length || !crypto.timingSafeEqual(Buffer.from(entry.codeHash), Buffer.from(codeHash))) {
      entry.verifyAttempts++;
      return false;
    }
    entry.emailVerified = true;
    entry.codeHash = null;
    entry.expiresAt = 0;
    entry.preferences.email = true;
    return true;
  }
  const db = getDatabase();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT email_otp_hash,email_otp_expires_at,email_otp_attempts FROM xorpay_notification_contacts " +
      "WHERE user_phone=$1 FOR UPDATE",
      [phone],
    );
    const row = result.rows[0];
    if (!row?.email_otp_hash || !row.email_otp_expires_at ||
        new Date(row.email_otp_expires_at).getTime() <= Date.now() ||
        row.email_otp_attempts >= 5) {
      await client.query("ROLLBACK");
      return false;
    }
    const matches = row.email_otp_hash.length === codeHash.length &&
      crypto.timingSafeEqual(Buffer.from(row.email_otp_hash), Buffer.from(codeHash));
    if (!matches) {
      await client.query(
        "UPDATE xorpay_notification_contacts SET email_otp_attempts=email_otp_attempts+1 WHERE user_phone=$1",
        [phone],
      );
      await client.query("COMMIT");
      return false;
    }
    await client.query(
      "UPDATE xorpay_notification_contacts SET email_verified_at=now(),email_notifications_enabled=true," +
      "email_otp_hash=NULL,email_otp_expires_at=NULL,email_otp_sent_at=NULL,email_otp_attempts=0 WHERE user_phone=$1",
      [phone],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getNotificationPreferences(phone) {
  if (!databaseConfigured()) {
    const entry = devContacts.get(phone);
    return {
      sms: Boolean(entry?.preferences?.sms), email: Boolean(entry?.preferences?.email && entry.emailVerified),
      push: Boolean(entry?.preferences?.push), emailVerified: Boolean(entry?.emailVerified),
      emailMasked: entry?.emailVerified && entry.emailCiphertext
        ? maskEmail(decryptKycValue(entry.emailCiphertext, entry.emailKeyId, phone, "email")) : null,
    };
  }
  const result = await getDatabase().query(
    "SELECT sms_notifications_enabled,email_notifications_enabled,push_notifications_enabled,email_verified_at,email_ciphertext,email_key_id " +
    "FROM xorpay_notification_contacts WHERE user_phone=$1",
    [phone],
  );
  const row = result.rows[0];
  const emailVerified = Boolean(row?.email_verified_at);
  const email = emailVerified && row?.email_ciphertext
    ? decryptKycValue(row.email_ciphertext, row.email_key_id, phone, "email") : null;
  return {
    sms: Boolean(row?.sms_notifications_enabled),
    email: Boolean(row?.email_notifications_enabled && emailVerified),
    push: Boolean(row?.push_notifications_enabled),
    emailVerified,
    emailMasked: email ? maskEmail(email) : null,
  };
}

export async function updateNotificationPreferences(phone, patch) {
  const allowed = ["sms", "email", "push"];
  if (Object.keys(patch).some((key) => !allowed.includes(key))) throw new TypeError("unsupported preference");
  if (!databaseConfigured()) {
    const entry = devContacts.get(phone) || { preferences: { sms: false, email: false, push: false } };
    if (patch.email === true && !entry.emailVerified) return false;
    Object.assign(entry.preferences, patch);
    devContacts.set(phone, entry);
    return true;
  }
  const db = getDatabase();
  const current = await getNotificationPreferences(phone);
  if (patch.email === true && !current.emailVerified) return false;
  await db.query(
    "INSERT INTO xorpay_notification_contacts(user_phone,sms_notifications_enabled,email_notifications_enabled,push_notifications_enabled) " +
    "VALUES($1,COALESCE($2,false),COALESCE($3,false),COALESCE($4,false)) " +
    "ON CONFLICT(user_phone) DO UPDATE SET " +
    "sms_notifications_enabled=COALESCE($2,xorpay_notification_contacts.sms_notifications_enabled)," +
    "email_notifications_enabled=COALESCE($3,xorpay_notification_contacts.email_notifications_enabled)," +
    "push_notifications_enabled=COALESCE($4,xorpay_notification_contacts.push_notifications_enabled)",
    [phone, patch.sms ?? null, patch.email ?? null, patch.push ?? null],
  );
  return true;
}

export async function registerDevice(phone, token, platform) {
  const tokenHash = hash(token);
  const encrypted = encryptKycValue(token, phone, "push_token");
  if (!databaseConfigured()) {
    devDevices.set(tokenHash, { phone, token: encrypted.ciphertext, keyId: encrypted.keyId, platform });
    const entry = devContacts.get(phone) || { preferences: { sms: false, email: false, push: true } };
    entry.preferences.push = true;
    devContacts.set(phone, entry);
    return;
  }
  await getDatabase().query(
    "INSERT INTO xorpay_notification_devices(token_hash,user_phone,token_ciphertext,token_key_id,platform) " +
    "VALUES($1,$2,$3,$4,$5) ON CONFLICT(token_hash) DO UPDATE SET user_phone=$2,token_ciphertext=$3," +
    "token_key_id=$4,platform=$5,last_seen_at=now(),disabled_at=NULL",
    [tokenHash, phone, encrypted.ciphertext, encrypted.keyId, platform],
  );
  await updateNotificationPreferences(phone, { push: true });
}

export async function unregisterDevice(phone, token) {
  const tokenHash = hash(token);
  if (!databaseConfigured()) { devDevices.delete(tokenHash); return; }
  await getDatabase().query(
    "DELETE FROM xorpay_notification_devices WHERE token_hash=$1 AND user_phone=$2",
    [tokenHash, phone],
  );
}

export async function getNotificationDestinations(phone) {
  if (!databaseConfigured()) {
    const entry = devContacts.get(phone);
    const tokens = [...devDevices.values()].filter((device) => device.phone === phone).map((d) =>
      decryptKycValue(d.token, d.keyId, phone, "push_token"));
    const email = entry?.emailCiphertext
      ? decryptKycValue(entry.emailCiphertext, entry.emailKeyId, phone, "email")
      : null;
    return { email, tokens, preferences: await getNotificationPreferences(phone) };
  }
  const db = getDatabase();
  const contactResult = await db.query(
    "SELECT email_ciphertext,email_key_id,email_verified_at,sms_notifications_enabled,email_notifications_enabled,push_notifications_enabled " +
    "FROM xorpay_notification_contacts WHERE user_phone=$1",
    [phone],
  );
  const contact = contactResult.rows[0];
  const deviceResult = await db.query(
    "SELECT token_ciphertext,token_key_id FROM xorpay_notification_devices WHERE user_phone=$1 AND disabled_at IS NULL",
    [phone],
  );
  const tokens = deviceResult.rows.map((row) => decryptKycValue(row.token_ciphertext, row.token_key_id, phone, "push_token"));
  const email = contact?.email_verified_at && contact.email_ciphertext
    ? decryptKycValue(contact.email_ciphertext, contact.email_key_id, phone, "email")
    : null;
  return {
    email,
    tokens,
    preferences: {
      sms: Boolean(contact?.sms_notifications_enabled),
      email: Boolean(contact?.email_notifications_enabled && contact?.email_verified_at),
      push: Boolean(contact?.push_notifications_enabled),
      emailVerified: Boolean(contact?.email_verified_at),
    },
  };
}

export async function removeInvalidDevice(phone, token) {
  return unregisterDevice(phone, token);
}
