# main.tf
# bb-users: Lambda behind an API Gateway HTTP API, deployed by CodePipeline on
# every push to main.
#
# Duplication note: brackets/terraform/main.tf is the same shape. The two
# services are separate repos with separate pipelines, so each owns its copy
# rather than sharing a module across repos.

locals {
  common_tags = {
    Project     = var.project
    Owner       = var.owner
    Environment = var.environment
    Service     = var.service_name
    Type        = "managed-resource"
  }

  lambda_name    = var.service_name
  codebuild_name = var.service_name
  pipeline_name  = "${var.service_name}-pipe"
  api_name       = "${var.service_name}-api"
}

data "aws_caller_identity" "current" {}

# ============================================
# LAMBDA
# ============================================

# Created ahead of the function so retention is ours, not Lambda's
# never-expire default.
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.lambda_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "main" {
  function_name = local.lambda_name
  runtime       = var.lambda_runtime
  architectures = ["x86_64"] # bcrypt is native; buildspec builds on the matching OS and arch
  handler       = "dist/lambda.handler"
  role          = aws_iam_role.lambda_execution.arn

  # Placeholder until the first pipeline run uploads real code.
  filename         = "${path.module}/placeholder.zip"
  source_code_hash = filebase64sha256("${path.module}/placeholder.zip")

  memory_size                    = var.lambda_memory
  timeout                        = var.lambda_timeout
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      NODE_ENV = var.node_env

      MONGO_URI  = var.mongo_uri
      JWT_SECRET = var.jwt_secret

      STRIPE_SECRET_KEY     = var.stripe_secret_key
      STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret

      RESEND_API_KEY = var.resend_api_key
      RESEND_FROM    = var.resend_from
      FRONTEND_URL   = var.frontend_url
    }
  }

  # CodeBuild owns the code after the first deploy. Without this, any later
  # apply would swap production back to the placeholder zip.
  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

# ============================================
# API GATEWAY (HTTP API)
# ============================================
# No API Gateway CORS config on purpose: Hapi answers preflights itself with
# the allowed-origin list in src/server.ts. Configuring both would make API
# Gateway swallow OPTIONS before Hapi sees it.

resource "aws_apigatewayv2_api" "main" {
  name          = local.api_name
  protocol_type = "HTTP"
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${local.api_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      ip                 = "$context.identity.sourceIp"
      requestTime        = "$context.requestTime"
      httpMethod         = "$context.httpMethod"
      routeKey           = "$context.routeKey"
      path               = "$context.path"
      status             = "$context.status"
      responseLength     = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
      integrationError   = "$context.integrationErrorMessage"
    })
  }

  # Far above real traffic, low enough that a scripted flood hits 429 here
  # before it reaches Lambda concurrency or Atlas connection limits.
  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.main.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0" # matches eventSourceName in src/lambda.ts
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.main.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ============================================
# DEPLOY PIPELINE: GitHub main -> CodeBuild -> lambda update-function-code
# ============================================

resource "aws_s3_bucket" "pipeline_artifacts" {
  bucket = "${var.project}-${var.service_name}-pipeline-artifacts"
}

resource "aws_s3_bucket_versioning" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "pipeline_artifacts" {
  bucket                  = aws_s3_bucket.pipeline_artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Source snapshots pile up one per push; nothing reads them after the run.
resource "aws_s3_bucket_lifecycle_configuration" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id

  rule {
    id     = "expire-old-artifacts"
    status = "Enabled"
    filter {}

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${local.codebuild_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_codebuild_project" "main" {
  name          = local.codebuild_name
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 15

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type = "BUILD_GENERAL1_SMALL"
    # Amazon Linux 2023, the same OS as the nodejs22.x Lambda runtime, so
    # bcrypt's native binary links against the glibc Lambda actually has.
    image                       = "aws/codebuild/amazonlinux-x86_64-standard:5.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "LAMBDA_FUNCTION_NAME"
      value = aws_lambda_function.main.function_name
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = "buildspec.yml"
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.codebuild.name
    }
  }
}

resource "aws_codepipeline" "main" {
  name          = local.pipeline_name
  role_arn      = aws_iam_role.codepipeline.arn
  pipeline_type = "V2"

  artifact_store {
    type     = "S3"
    location = aws_s3_bucket.pipeline_artifacts.bucket
  }

  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]

      configuration = {
        ConnectionArn    = var.codestar_connection_arn
        FullRepositoryId = "${var.github_owner}/${var.github_repo}"
        BranchName       = var.github_branch
        DetectChanges    = true
      }
    }
  }

  stage {
    name = "Build"

    action {
      name            = "BuildAndDeploy"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["source_output"]

      configuration = {
        ProjectName = aws_codebuild_project.main.name
      }
    }
  }
}
