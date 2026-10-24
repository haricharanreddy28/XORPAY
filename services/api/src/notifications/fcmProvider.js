import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let app;

function getFcm() {
  const encoded = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (!encoded) return null;
  if (!app) {
    let serviceAccount;
    try { serviceAccount = JSON.parse(encoded); }
    catch { throw new Error("FIREBASE_ADMIN_CREDENTIALS_JSON must be valid JSON"); }
    app = getApps().find((candidate) => candidate.name === "xorpay-messaging") ||
      initializeApp({ credential: cert(serviceAccount) }, "xorpay-messaging");
  }
  return getMessaging(app);
}

export async function sendPush(tokens, title, body) {
  const messaging = getFcm();
  if (!messaging || !tokens.length) return { invalidTokens: [] };
  const invalidTokens = [];
  for (let offset = 0; offset < tokens.length; offset += 500) {
    const batch = tokens.slice(offset, offset + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: { type: "xorpay_notification" },
      android: { priority: "high" },
    });
    response.responses.forEach((result, index) => {
      const code = result.error?.code;
      if (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token") invalidTokens.push(batch[index]);
    });
  }
  return { invalidTokens };
}
