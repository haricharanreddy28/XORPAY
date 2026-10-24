variable "aws_account_id" {
  description = "12-digit AWS account ID used to prevent applying in the wrong account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}

variable "aws_region" {
  description = "AWS region for pilot workloads and certificates."
  type        = string
  default     = "ap-south-1"

  validation {
    condition     = var.aws_region == "ap-south-1"
    error_message = "XORPAY pilot data resources must remain in ap-south-1 (Mumbai)."
  }
}

variable "environment" {
  description = "Deployment environment tag."
  type        = string
  default     = "pilot"
}

variable "root_domain" {
  description = "Registered root domain. The hosted zone will be created here."
  type        = string
  default     = "xorpay.online"
}

variable "api_hostname" {
  description = "Public hostname for the API."
  type        = string
  default     = "api.xorpay.online"
}

variable "admin_hostname" {
  description = "Public hostname for the admin panel."
  type        = string
  default     = "admin.xorpay.online"
}
