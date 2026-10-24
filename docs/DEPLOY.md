# XORPAY pilot deployment

This branch is a limited-pilot foundation, not a live-money release.
Production startup remains blocked until the remaining persistence,
reconciliation, monitoring, and operational controls are verified. Do not
point production Cashfree credentials at this branch.

## 1. Create the Route 53 hosted zone

The domain registrar is outside AWS. Use an AWS IAM Identity Center profile or
another short-lived AWS credential flow for account `157000087920`; never paste
AWS access keys into chat or commit them.

In PowerShell:

```powershell
cd infra/terraform
Copy-Item terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars and set aws_account_id to your 12-digit account ID.
terraform init
terraform plan -out zone.tfplan
terraform apply zone.tfplan
terraform output -json registrar_nameservers
```

The first apply creates only the public Route 53 zone for `xorpay.online`.
At the registrar, replace its current nameservers with all values returned by
Terraform. Wait for DNS delegation to propagate before continuing. The zone has
`prevent_destroy` enabled.

## 2. Request and validate ACM

After the registrar delegates the domain to Route 53, add this to
`terraform.tfvars`:

```hcl
create_edge_certificate = true
```

Then run:

```powershell
terraform plan -out edge.tfplan
terraform apply edge.tfplan
terraform output edge_certificate_arn
```

The ACM certificate covers `api.xorpay.online` and `admin.xorpay.online` in
`ap-south-1`. This bootstrap does not deploy the applications or create their
load-balancer alias records.

## 3. Configure Cognito for admin sign-in

Create an Amazon Cognito user pool in `ap-south-1`. Require MFA, create a
public app client with authorization-code grant and PKCE (no client secret),
and configure its callback as `https://admin.xorpay.online/login`. Create the
groups `xorpay-super-admin`, `xorpay-ops`, `xorpay-finance`,
`xorpay-support`, and `xorpay-compliance`; assign named staff individually
using least privilege. Keep at least two separate finance identities for
maker-checker review. Never use the local development tokens in a deployed
environment.

Set the API values from `services/api/.env.example` in AWS Secrets Manager:
`ADMIN_COGNITO_ISSUER`, `ADMIN_COGNITO_CLIENT_ID`,
`ADMIN_AUDIT_HASH_KEY`, and the exact `ADMIN_CORS_ORIGINS`. Set the matching
public Cognito domain, client ID, callback URI, API URL, and
`NEXT_PUBLIC_ADMIN_AUTH_MODE=cognito` in the admin runtime configuration.

The API validates Cognito access-token signatures, issuer, app client, expiry,
token use, and signed group membership. Mutation attempts require a durable
PostgreSQL audit insert before the handler runs. Resource identifiers are
stored only as keyed HMACs.

## 4. Provision application infrastructure

Before deploying the API, provision the Mumbai runtime, private PostgreSQL,
Redis, encrypted object storage, Secrets Manager entries, TLS ingress, backups,
monitoring, and alerting. Use least-privilege IAM roles and short-lived
credentials. The repository does not yet provision this runtime or persist all
admin/business domains. The production mode guard remains enabled until these
controls are completed.

Payment foundations on this branch include PostgreSQL reservations, encrypted
beneficiary destinations, signature-verified Cashfree collection webhooks, a
durable payout outbox, payout status recovery, and refund ledgering only after
Cashfree confirms refund success. Remaining launch gates include durable admin
and business data, settlement/reconciliation jobs, Cashfree contract verification
with your merchant account, operational alarms, and reviewed compliance/support
runbooks.

Keep Terraform state, plans, `terraform.tfvars`, and credentials out of Git.
Use an encrypted, access-controlled remote state backend before provisioning
application infrastructure.

## 5. Mobile release

Use the internal Play testing track first. Build only with the pilot API
hostname after the HTTPS runtime and mobile security configuration are ready.
Keep signing keys outside GitHub and restrict distribution to allowlisted
pilot users. A debug APK or sandbox build is not a production release.
