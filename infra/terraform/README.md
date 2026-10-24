# AWS Mumbai DNS and TLS bootstrap

This stack is the first infrastructure step for the XORPAY pilot. It creates a
public Route 53 hosted zone for `xorpay.online` and requests a DNS-validated
ACM certificate in `ap-south-1` for `api.xorpay.online` and
`admin.xorpay.online`. It does not deploy the API or admin app yet.

## Requirements

- Terraform 1.11 or later.
- AWS CLI credentials for the intended account, configured locally (for
  example, an AWS IAM Identity Center profile). Never put access keys in this
  directory or in GitHub.
- The AWS account ID you supplied: `157000087920`.
- Permission to create Route 53 hosted zones and ACM certificates.

## Apply in two stages

The domain is registered outside AWS, so first create the hosted zone, then
delegate the domain to its Route 53 nameservers before asking ACM to validate
the certificate.

```powershell
cd infra/terraform
Copy-Item terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars and replace the placeholder AWS account ID.
terraform init
terraform plan -out bootstrap.tfplan
terraform apply bootstrap.tfplan
terraform output -json registrar_nameservers
```

At your registrar, replace the domain's current nameservers with all nameservers
from `registrar_nameservers`. Wait for the registrar/DNS delegation to
propagate, then run:

```powershell
terraform plan -out edge.tfplan
terraform apply edge.tfplan
terraform output edge_certificate_arn
```

The second apply completes ACM DNS validation. Do not destroy the hosted zone:
it has `prevent_destroy` enabled to protect the domain's DNS.

Terraform state may contain infrastructure identifiers. Keep the state out of
Git. Before provisioning application infrastructure, move state to an encrypted,
versioned S3 backend with locking; the live-money API remains blocked until its
PostgreSQL persistence, payout, admin, and reconciliation controls are complete.
