const VERIFY_BASE = "https://verify.twilio.com/v2/Services";

export class TwilioVerifyError extends Error {
  constructor(status, code) {
    super("Twilio Verify request failed");
    this.name = "TwilioVerifyError";
    this.status = status;
    this.code = code;
  }
}

function configuration(env = process.env) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    return null;
  }
  return { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID };
}

async function postVerify(path, fields, { env = process.env, fetchImpl = fetch } = {}) {
  const config = configuration(env);
  if (!config) throw new TwilioVerifyError(503, "otp_not_configured");

  const auth = Buffer.from(
    config.TWILIO_ACCOUNT_SID + ":" + config.TWILIO_AUTH_TOKEN,
  ).toString("base64");
  const response = await fetchImpl(
    `${VERIFY_BASE}/${config.TWILIO_VERIFY_SERVICE_SID}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields),
    },
  );

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Keep provider response details and PII out of the application logs.
  }
  if (!response.ok) {
    throw new TwilioVerifyError(response.status, "otp_provider_error");
  }
  return data;
}

export async function sendVerification(to, options) {
  const result = await postVerify("Verifications", { To: to, Channel: "sms" }, options);
  return result.status === "pending" || result.status === "approved";
}

export async function checkVerification(to, code, options) {
  try {
    const result = await postVerify(
      "VerificationCheck",
      { To: to, Code: code },
      options,
    );
    return result.status === "approved";
  } catch (error) {
    // Twilio removes checks after expiry or when the attempt limit is reached.
    if (error instanceof TwilioVerifyError && error.status === 404) return false;
    throw error;
  }
}
