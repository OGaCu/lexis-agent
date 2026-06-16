#!/usr/bin/env bash
set -euo pipefail

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_DEFAULT_REGION:-us-east-1}
CLUSTER=lexis-cluster

SERVICES=(api-gateway vocab-service invest-service scheduler frontend)

echo "==> Logging in to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
    "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "==> Building and pushing images"
for svc in "${SERVICES[@]}"; do
  if [ "$svc" = "frontend" ]; then
    ctx="$ROOT_DIR/frontend"
  else
    ctx="$ROOT_DIR/services/$svc"
  fi
  image="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/lexis-$svc:latest"
  echo "  Building $svc..."
  docker build -t "$image" "$ctx"
  docker push "$image"
done

echo "==> Registering task definitions"
TD_DIR="$(dirname "$0")/task-definitions"
for svc in "${SERVICES[@]}"; do
  td_file="$TD_DIR/$svc.json"
  # Substitute placeholders
  td_json=$(sed \
    -e "s/<AWS_ACCOUNT_ID>/$AWS_ACCOUNT_ID/g" \
    -e "s/<AWS_REGION>/$AWS_REGION/g" \
    "$td_file")
  aws ecs register-task-definition \
    --cli-input-json "$td_json" \
    --region "$AWS_REGION" \
    --query "taskDefinition.taskDefinitionArn" \
    --output text
  echo "  Registered task definition for $svc"
done

echo "==> Updating ECS services"
for svc in "${SERVICES[@]}"; do
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "lexis-$svc" \
    --task-definition "lexis-$svc" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    --output text \
    --query "service.serviceArn" || echo "  Warning: service lexis-$svc not found; skipping"
done

echo "==> Deploy complete"
