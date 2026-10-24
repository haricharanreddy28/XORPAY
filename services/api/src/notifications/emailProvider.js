import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const clients = new Map();
function sesClient(env = process.env) {
  const region = env.AWS_REGION || "ap-south-1";
  if (!clients.has(region)) clients.set(region, new SESv2Client({ region }));
  return clients.get(region);
}

function fromAddress(env = process.env) {
  if (!env.SES_FROM_EMAIL) {
    const error = new Error("SES_FROM_EMAIL is required");
    error.code = "ses_not_configured";
    throw error;
  }
  return env.SES_FROM_EMAIL;
}

export async function sendEmail({ to, subject, text, html }, env = process.env) {
  if (!to || !subject || !text) throw new TypeError("email recipient, subject, and text are required");
  const response = await sesClient(env).send(new SendEmailCommand({
    FromEmailAddress: fromAddress(env),
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: text, Charset: "UTF-8" },
          ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
        },
      },
    },
  }));
  return response.MessageId;
}

export async function sendEmailVerification(to, code, env = process.env) {
  return sendEmail({
    to,
    subject: "Verify your XORPAY email",
    text: `Your XORPAY verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `<p>Your XORPAY verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`,
  }, env);
}

export async function sendNotificationEmail(to, title, body, env = process.env) {
  return sendEmail({ to, subject: title, text: body }, env);
}
