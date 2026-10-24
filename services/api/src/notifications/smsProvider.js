const TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts";

export async function sendTransactionalSms(to, body, env = process.env) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID } = env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_MESSAGING_SERVICE_SID) {
    const error = new Error("Twilio Messaging is not configured");
    error.code = "twilio_sms_not_configured";
    throw error;
  }
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`${TWILIO_MESSAGES_URL}/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
      Body: body,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const error = new Error(`Twilio Messaging failed (${response.status})`);
    error.code = response.status === 429 ? "twilio_sms_rate_limited" : "twilio_sms_provider_error";
    throw error;
  }
  const result = await response.json();
  return result.sid;
}
