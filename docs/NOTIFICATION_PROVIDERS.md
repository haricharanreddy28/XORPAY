# Live messaging provider setup

This repository wires the API to Twilio Verify (login OTP), Twilio Messaging
(transactional SMS), Amazon SES v2 (email verification and notices), and Firebase
Cloud Messaging (Android/iOS push). The integrations are opt-in at the user
preference level; SMS/email/push delivery errors do not change payment status.

## Provider accounts

### Twilio

1. Rotate the credentials previously pasted into the XORPAY chat. Put the new
   account SID, Auth Token, Verify Service SID, and Messaging Service SID in
   AWS Secrets Manager; never add real values to Git or mobile builds.
2. Create a Twilio Verify service for OTP and a Messaging Service for alerts.
3. Complete Twilio's India DLT sender, entity, header, and template registrations
   for each applicable message category. Have the registered templates approved
   before live sends. Verify delivery using actual Indian carrier numbers; DLT,
   DND, sender, and template policy can block messages.
4. Set `OTP_PROVIDER=twilio` and the `TWILIO_*` variables from
   `services/api/.env.example`. The API stores OTP send-rate keys as SHA-256
   hashes in PostgreSQL; provider credentials remain server-side.

### Amazon SES

1. Use SES in `ap-south-1`; verify the sending domain or address and configure
   DKIM. Request production access in that region before sending to unverified
   customer addresses. SES sandbox accounts can only send to verified identities.
2. Set `SES_FROM_EMAIL` to an address under the verified identity. Give the API
   ECS task role least-privilege `ses:SendEmail` access; the SDK uses the task
   role, not embedded AWS keys.
3. Store `AWS_REGION=ap-south-1` and the verified sender in runtime config.

### Firebase Cloud Messaging

1. Create/register the Android app with the exact application ID in the Flutter
   Gradle config and enable Firebase Cloud Messaging. Follow FlutterFire setup
   for the native Android Firebase configuration. For iOS, register the bundle
   ID and APNs key/certificate in Firebase before building.
2. Pass the Firebase client values as Flutter `--dart-define` values matching
   `apps/mobile/lib/firebase_options.dart`; do not commit service-account JSON.
3. Store the Firebase Admin service-account JSON in AWS Secrets Manager and
   inject it as `FIREBASE_ADMIN_CREDENTIALS_JSON` into the API task. The service
   account must belong to the same Firebase project used by the mobile app.
4. Push permission is requested after sign-in. Tokens are encrypted at rest,
   hashed for lookup, refreshed on the device, and removed on logout.

## Database and API

Apply migrations in order, including `006_notification_channels.sql` and
`007_otp_rate_limits.sql`, before starting the API. Production mode requires
PostgreSQL, Redis-backed auth sessions, strong JWT and encryption keys, Cashfree
production configuration, and all four messaging integrations. Startup checks
required provider configuration. User email addresses and push tokens use the
KYC AES-256-GCM keyring; provision and back up that keyring before enabling
notification endpoints.

Email verification codes expire after ten minutes and lock after five failed
attempts. Sending is limited to one request per minute and five per hour per user.
OTP SMS is limited to one request per 30 seconds and five per hour by hashed
(IP, phone) key. Configure proxy trust correctly so Express derives the real
client IP from only the trusted load balancer.

## Pilot checks

Use provider test destinations first. Confirm OTP, email verification, preference
opt-in/out, token refresh and logout removal, invalid-token cleanup, and in-app
notification persistence. Then test payment-notification delivery with Cashfree
sandbox. Before any real-money pilot, confirm Cashfree production approval for
the exact vendor/rent categories, complete identity face-match and production
KYC review, and have payment reconciliation, on-call monitoring, and refund/
dispute runbooks ready. No real-money operation is enabled by this guide alone.

## Deployment status

The current Terraform only bootstraps Route 53 and ACM; it does not create the
API runtime, database, Redis, admin hosting, or deploy applications. The API and
mobile provider integrations can be configured after those resources exist, but
this change does not deploy to AWS or delegate `xorpay.online`.
