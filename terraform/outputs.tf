# outputs.tf

output "api_url" {
  description = "Custom domain the UI points at (VITE_USERS_BASE_URL)"
  value       = "https://${var.api_domain_name}"
}

output "execute_api_url" {
  description = "Raw API Gateway URL, for smoke tests before DNS resolves"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "stripe_webhook_url" {
  description = "Add this as a second Stripe webhook endpoint at cutover"
  value       = "https://${var.api_domain_name}/stripe-webhook"
}

output "lambda_function_name" {
  value = aws_lambda_function.main.function_name
}

output "pipeline_name" {
  value = aws_codepipeline.main.name
}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
