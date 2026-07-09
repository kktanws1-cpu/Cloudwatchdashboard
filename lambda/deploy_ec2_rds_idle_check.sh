#!/usr/bin/env bash
#
# One-command deploy for the EC2/RDS Left-Running Check Lambda.
#
# Deploys a single Lambda in ap-southeast-1 that fires every weekday at
# 8pm SGT (12:00 UTC, Mon–Fri) and posts a Slack message listing every
# running EC2 instance and available RDS instance, with uptime + avg CPU.
#
# Usage:
#   SLACK_WEBHOOK="https://hooks.slack.com/..." ./deploy_ec2_rds_idle_check.sh
#
# Re-run safely — every step is idempotent.
#
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────
FUNCTION_NAME="${FUNCTION_NAME:-ec2-rds-idle-check}"
ROLE_NAME="${ROLE_NAME:-ec2-rds-idle-check-role}"
RULE_NAME="${RULE_NAME:-ec2-rds-idle-check-rule}"
REGION="${REGION:-ap-southeast-1}"
SCAN_REGIONS="${SCAN_REGIONS:-ap-southeast-1}"
SCHEDULE_CRON="${SCHEDULE_CRON:-cron(0 12 ? * MON-FRI *)}"   # 12:00 UTC = 20:00 SGT, weekdays
HERE="$(cd "$(dirname "$0")" && pwd)"
ZIP_PATH="$HERE/ec2_rds_idle_check.zip"
LAMBDA_SRC="$HERE/ec2_rds_idle_check_lambda.py"

# Windows-style path for the AWS CLI (which is the Windows binary under Git Bash)
if command -v cygpath >/dev/null 2>&1; then
  ZIP_PATH_AWS="$(cygpath -w "$ZIP_PATH")"
else
  ZIP_PATH_AWS="$ZIP_PATH"
fi

: "${SLACK_WEBHOOK:?Set SLACK_WEBHOOK to your Slack incoming webhook URL}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo "▶ Account: $ACCOUNT_ID  •  Deploy region: $REGION  •  Scan regions: $SCAN_REGIONS"

# ── 1. IAM role ────────────────────────────────────────────────────────
echo "▶ Ensuring IAM role: $ROLE_NAME"
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "  role exists"
else
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST" >/dev/null
  echo "  role created — waiting for IAM propagation"
  sleep 10
fi

aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null

INLINE='{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":[
    "ec2:DescribeInstances",
    "ec2:StopInstances",
    "rds:DescribeDBInstances",
    "cloudwatch:GetMetricStatistics"
  ],"Resource":"*"}
]}'
aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name ec2-rds-idle-check-inline \
  --policy-document "$INLINE" >/dev/null

# ── 2. Package Lambda ──────────────────────────────────────────────────
echo "▶ Packaging $LAMBDA_SRC → $ZIP_PATH"
rm -f "$ZIP_PATH"
if command -v zip >/dev/null 2>&1; then
  (cd "$HERE" && zip -q "$(basename "$ZIP_PATH")" "$(basename "$LAMBDA_SRC")")
else
  # Python on Windows can't read Git Bash /c/... paths — cd into the dir and use basenames
  (cd "$HERE" && python -c "import zipfile; zipfile.ZipFile('$(basename "$ZIP_PATH")','w',zipfile.ZIP_DEFLATED).write('$(basename "$LAMBDA_SRC")')")
fi

# ── 3. Lambda create/update ────────────────────────────────────────────
AUTO_STOP_EC2="${AUTO_STOP_EC2:-true}"
ENV_VARS="Variables={SLACK_WEBHOOK=$SLACK_WEBHOOK,REGIONS=$SCAN_REGIONS,AUTO_STOP_EC2=$AUTO_STOP_EC2}"

if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "▶ Updating Lambda code"
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH_AWS" \
    --region "$REGION" >/dev/null

  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" --region "$REGION"

  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --environment "$ENV_VARS" \
    --timeout 60 \
    --region "$REGION" >/dev/null
else
  echo "▶ Creating Lambda"
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime python3.12 \
    --role "$ROLE_ARN" \
    --handler ec2_rds_idle_check_lambda.lambda_handler \
    --zip-file "fileb://$ZIP_PATH_AWS" \
    --timeout 60 \
    --environment "$ENV_VARS" \
    --region "$REGION" >/dev/null
fi

LAMBDA_ARN="$(aws lambda get-function \
  --function-name "$FUNCTION_NAME" \
  --query 'Configuration.FunctionArn' --output text \
  --region "$REGION")"
echo "  Lambda ARN: $LAMBDA_ARN"

# ── 4. EventBridge schedule ────────────────────────────────────────────
echo "▶ Ensuring EventBridge rule: $RULE_NAME ($SCHEDULE_CRON)"
aws events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "$SCHEDULE_CRON" \
  --region "$REGION" >/dev/null

aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "Id=1,Arn=$LAMBDA_ARN" \
  --region "$REGION" >/dev/null

aws lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id "${RULE_NAME}-invoke" \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}" \
  --region "$REGION" 2>/dev/null || echo "  invoke permission already set"

echo ""
echo "✅ Done."
echo "   Test now:  aws lambda invoke --function-name $FUNCTION_NAME --region $REGION /tmp/out.json && cat /tmp/out.json"
echo "   Logs:      aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $REGION"
