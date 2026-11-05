# monitoring.tf
# Alarms email var.alert_email through SNS. AWS sends a confirmation email
# after the first apply; nothing is delivered until it is clicked.

resource "aws_sns_topic" "alerts" {
  name = "${var.service_name}-alerts"
}

resource "aws_sns_topic_subscription" "alert_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Unhandled throws, timeouts, OOM kills, and failed cold starts.
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.service_name}-lambda-errors"
  alarm_description   = "More than 5 Lambda errors in 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.main.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# Average above half the timeout means something is hanging (Atlas, Stripe,
# Resend) well before requests start timing out.
resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  alarm_name          = "${var.service_name}-lambda-high-duration"
  alarm_description   = "Average duration above half the ${var.lambda_timeout}s timeout for 10 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = var.lambda_timeout * 1000 / 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.main.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# Any throttle means the reserved_concurrency cap was hit.
resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${var.service_name}-lambda-throttles"
  alarm_description   = "Lambda hit its reserved concurrency cap"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.main.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# 5xx returned by API Gateway itself: Lambda timeouts and integration errors.
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.service_name}-api-5xx"
  alarm_description   = "More than 10 API Gateway 5xx responses in 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiId = aws_apigatewayv2_api.main.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}
