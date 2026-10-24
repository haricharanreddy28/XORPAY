import { createNotification, getNotificationDestinations, removeInvalidDevice } from "./notificationRepository.js";
import { sendNotificationEmail, sendEmailVerification } from "./emailProvider.js";
import { sendTransactionalSms } from "./smsProvider.js";
import { sendPush } from "./fcmProvider.js";

export function assertNotificationConfiguration(env = process.env) {
  const production = env.NODE_ENV === "production" ||
    String(env.CASHFREE_ENV || "").toUpperCase() === "PRODUCTION";
  if (!production) return;
  const missing = [];
  if ((env.OTP_PROVIDER || "twilio") !== "twilio") missing.push("OTP_PROVIDER=twilio");
  for (const name of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID",
    "TWILIO_MESSAGING_SERVICE_SID", "SES_FROM_EMAIL", "FIREBASE_ADMIN_CREDENTIALS_JSON"]) {
    if (!env[name]) missing.push(name);
  }
  if (String(env.AWS_REGION || "") !== "ap-south-1") missing.push("AWS_REGION=ap-south-1");
  if (missing.length) throw new Error("Production notifications are missing: " + missing.join(", "));
}

function logDeliveryFailure(channel, error) {
  console.error(`[notification] ${channel} delivery failed`, error?.code || "provider_error");
}

/** Persist in-app notification first; outbound delivery failures never affect payment settlement. */
export async function notify(phone, title, body, type = "info") {
  const notification = await createNotification(phone, { title, body, type });
  try {
    const destination = await getNotificationDestinations(phone);
    const { preferences, tokens, email } = destination;
    const sends = [];
    if (preferences.push && tokens.length) {
      sends.push(sendPush(tokens, title, body).then(async (result) => {
        await Promise.all(result.invalidTokens.map((token) => removeInvalidDevice(phone, token)));
      }).catch((error) => logDeliveryFailure("fcm", error)));
    }
    if (preferences.email && email) {
      sends.push(sendNotificationEmail(email, title, body).catch((error) => logDeliveryFailure("ses", error)));
    }
    if (preferences.sms) {
      sends.push(sendTransactionalSms(phone, `${title}: ${body}`).catch((error) => logDeliveryFailure("twilio_sms", error)));
    }
    await Promise.all(sends);
  } catch (error) {
    logDeliveryFailure("dispatch", error);
  }
  return notification;
}

export { sendEmailVerification };
