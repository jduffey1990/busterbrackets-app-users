# provider.tf
#
# State lives in the shared BusterBrackets state bucket, created once by
# ./bootstrap. Apply that first, then `terraform init` here.
#
# Coupling: the bucket name is repeated in bootstrap/main.tf and in
# brackets/terraform/provider.tf. A backend block cannot read variables.

terraform {
  required_version = ">= 1.10" # use_lockfile (S3-native state locking)

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "busterbrackets-tfstate-us-east-2"
    key          = "users/terraform.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}
