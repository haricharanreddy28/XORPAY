data "aws_caller_identity" "current" {}

resource "aws_route53_zone" "public" {
  name    = var.root_domain
  comment = "XORPAY public DNS zone"

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = "xorpay-public-zone"
  }
}

resource "aws_acm_certificate" "edge" {
  count                     = var.create_edge_certificate ? 1 : 0
  domain_name               = var.api_hostname
  subject_alternative_names = [var.admin_hostname]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "xorpay-pilot-edge"
  }
}

resource "aws_route53_record" "certificate_validation" {
  for_each = var.create_edge_certificate ? {
    for option in try(aws_acm_certificate.edge[0].domain_validation_options, []) :
    option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.public.zone_id
}

resource "aws_acm_certificate_validation" "edge" {
  count           = var.create_edge_certificate ? 1 : 0
  certificate_arn = aws_acm_certificate.edge[0].arn
  validation_record_fqdns = [
    for record in aws_route53_record.certificate_validation : record.fqdn
  ]
}
