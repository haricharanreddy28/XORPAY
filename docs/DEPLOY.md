# XORPAY pilot deployment

The repository contains a limited-pilot foundation, not a live-money release.
Production startup remains deliberately blocked until the remaining admin,
reconciliation, monitoring, and operational controls are independently
verified. Do not point production Cashfree credentials at this branch.

## 1. Create the Route 53 hosted zone

The domain registrar is outside AWS. Use an AWS IAM Identity Center profile or
another short-lived AWS credential flow for account `157000087920`; never paste
AWS keys into chat or commit them.

In PowerShell:

```powershell
cd infra/terraform
Copy-Item terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: set aws_account_id to your 12-digit account ID.
terraform init
terraform plan -out zone.tfplan
terraform apply zone.tfplan
terraform output -json registrar_nameservers
```

This first apply creates only the public Route 53 zone for `xorpay.online`.
At the domain registrar, replace the current nameservers with all four returned
nameservers. Wait for delegation to propagate before continuing. The zone is
protected with `prevent_destroy`.

## 2. Request and validate ACM

After public DNS resolves through Route 53, enable certificate creation in
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

The certificate covers `api.xorpay.online` and `admin.xorpay.online` in
`ap-south-1`. This bootstrap does not deploy either application or create
their DNS A/ALIAS records; those records are added with the load balancer later.

Terraform state contains resource identifiers. Keep it out of Git and back it
up securely. Do not commit `terraform.tfvars`, plan files, or state files.

## 3. Configure application infrastructure

Before deploying the API, provision the Mumbai runtime, private PostgreSQL,
Redis, encrypted object storage, Secrets Manager entries, TLS ingress, backups,
monitoring, and alerting. Use least-privilege IAM roles and short-lived
credentials. The repository does not yet provision this runtime.

The backend now has PostgreSQL payment reservations, encrypted beneficiary
destinations, signature-verified Cashfree collection webhooks, a durable payout
outbox, Cashfree payout status recovery, and refund ledgering after confirmed
Cashfree refund success. Remaining launch gates include production admin
authentication and maker-checker audit, persistence for remaining domains,
settlement/reconciliation workflows, operational alerts, provider contract
verification against your merchant account, and reviewed compliance/support
runbooks. Production mode is disabled in code until those controls are
complete.

## 4. Mobile release

Use the internal Play testing track first. Build only with the pilot API
hostname after the HTTPS runtime and mobile security configuration are ready.
Keep signing keys outside GitHub and restrict distribution to the allowlisted
pilot users. A debug APK or sandbox build is not a production release.
