# bootstrap/main.tf
#
# One-off: the S3 bucket that holds Terraform state for every BusterBrackets
# stack (users, brackets). It uses LOCAL state by design, since a bucket cannot
# hold its own state. That local state is gitignored; if it is ever lost,
# `terraform import aws_s3_bucket.tfstate busterbrackets-tfstate-us-east-2`
# recovers it.
#
# It lives in the users repo only because ~/code/buster is not a repo itself.
#
# Usage:
#   cd terraform/bootstrap && terraform init && terraform apply
#   cd .. && terraform init

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-2"

  default_tags {
    tags = {
      Project     = "busterbrackets"
      Owner       = "jduffey"
      Environment = "production"
      Service     = "tfstate"
      Type        = "managed-resource"
    }
  }
}

# Coupling: this name is hardcoded in the backend block of
# users/terraform/provider.tf and brackets/terraform/provider.tf.
resource "aws_s3_bucket" "tfstate" {
  bucket = "busterbrackets-tfstate-us-east-2"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# State holds the Lambda environment (Mongo URI, JWT and Stripe secrets) in
# plain text, so the bucket is private and TLS-only.
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "tfstate_tls_only" {
  bucket = aws_s3_bucket.tfstate.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        aws_s3_bucket.tfstate.arn,
        "${aws_s3_bucket.tfstate.arn}/*",
      ]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.tfstate]
}

output "state_bucket" {
  value = aws_s3_bucket.tfstate.bucket
}
