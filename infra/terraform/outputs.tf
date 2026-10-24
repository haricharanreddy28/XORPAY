output "aws_account_id" {
  description = "AWS account selected by the provider guard."
  value       = data.aws_caller_identity.current.account_id
}

output "route53_zone_id" {
  description = "Public Route 53 hosted zone ID."
  value       = aws_route53_zone.public.zone_id
}

output "registrar_nameservers" {
  description = "Set these nameservers at the domain registrar after the bootstrap apply."
  value       = aws_route53_zone.public.name_servers
}

output "api_hostname" {
  description = "Planned API hostname."
  value       = var.api_hostname
}

output "admin_hostname" {
  description = "Planned admin hostname."
  value       = var.admin_hostname
}

output "edge_certificate_arn" {
  description = "Validated ACM certificate ARN for API/admin HTTPS listeners."
  value       = try(aws_acm_certificate_validation.edge[0].certificate_arn, null)
}
