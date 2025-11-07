#!/bin/bash

# Local Development Setup Script
# This script fetches SSM parameters, creates .env, builds Docker image, and pushes to ECR
# Usage: ./setup.sh [-p <profile>] [-t <tag>] [--skip-build] [--skip-push]

set -e

# Load constants
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/constants.sh"

# Default values
AWS_PROFILE=""
IMAGE_TAG="latest"
SKIP_BUILD=false
SKIP_PUSH=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--profile) AWS_PROFILE="$2"; shift 2 ;;
    -t|--tag) IMAGE_TAG="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --skip-push) SKIP_PUSH=true; shift ;;
    -h|--help)
      echo "Usage: $0 [-p <profile>] [-t <tag>] [--skip-build] [--skip-push]"
      echo ""
      echo "Options:"
      echo "  -p, --profile    AWS profile to use"
      echo "  -t, --tag        Docker image tag (default: latest)"
      echo "  --skip-build     Skip Docker build step"
      echo "  --skip-push      Skip Docker push step"
      echo ""
      echo "This script will:"
      echo "  1. Fetch SSM parameters and create .env file"
      echo "  2. Build Docker image"
      echo "  3. Push image to ECR repository"
      exit 0
      ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# Validate profile is provided
if [[ -z "$AWS_PROFILE" ]]; then
    echo -e "${RED}Error: AWS profile is required${NC}"
    echo "Usage: $0 -p <profile>"
    exit 1
fi

export AWS_PROFILE="$AWS_PROFILE"
PROFILE_OPT="--profile $AWS_PROFILE"

echo "=============================================="
echo "Local Development Setup"
echo "=============================================="
echo "Environment: ${ENVIRONMENT_NAME}"
echo "Component: ${COMPONENT_NAME}"
echo "Part Name: ${PART_NAME}"
echo "AWS Region: ${AWS_REGION}"
echo "AWS Profile: ${AWS_PROFILE}"
echo "Image Tag: ${IMAGE_TAG}"
echo "=============================================="
echo ""

# Step 1: Fetch SSM parameters and create .env file
echo -e "${BLUE}Step 1: Fetching SSM parameters...${NC}"
if [[ -f "${SCRIPT_DIR}/fetch-ssm.sh" ]]; then
    "${SCRIPT_DIR}/fetch-ssm.sh" -p "$AWS_PROFILE" -o .env
    echo -e "${GREEN}✅ Environment variables fetched${NC}"
else
    echo -e "${YELLOW}⚠️  fetch-ssm.sh not found, skipping .env creation${NC}"
fi
echo ""

# Step 2: Build Docker image
if [[ "$SKIP_BUILD" == "false" ]]; then
    echo -e "${BLUE}Step 2: Building Docker image...${NC}"
    docker build -t "${ECR_REPO_NAME}:${IMAGE_TAG}" .
    echo -e "${GREEN}✅ Docker image built: ${ECR_REPO_NAME}:${IMAGE_TAG}${NC}"
    echo ""
else
    echo -e "${YELLOW}⏭️  Skipping Docker build${NC}"
    echo ""
fi

# Step 3: Get AWS Account ID and ECR repository URI
echo -e "${BLUE}Step 3: Getting ECR repository details...${NC}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity \
    --region "${AWS_REGION}" \
    ${PROFILE_OPT} \
    --query 'Account' \
    --output text)

ECR_REPO_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"
ECR_IMAGE_TAG="${ECR_REPO_URI}:${IMAGE_TAG}"

echo "AWS Account ID: ${AWS_ACCOUNT_ID}"
echo "ECR Repository: ${ECR_REPO_URI}"
echo "ECR Image: ${ECR_IMAGE_TAG}"
echo ""

# Step 4: Login to ECR
if [[ "$SKIP_PUSH" == "false" ]]; then
    echo -e "${BLUE}Step 4: Logging into ECR...${NC}"
    aws ecr get-login-password \
        --region "${AWS_REGION}" \
        ${PROFILE_OPT} | \
        docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    echo -e "${GREEN}✅ Logged into ECR${NC}"
    echo ""
fi

# Step 5: Tag image for ECR
if [[ "$SKIP_PUSH" == "false" ]]; then
    echo -e "${BLUE}Step 5: Tagging image for ECR...${NC}"
    docker tag "${ECR_REPO_NAME}:${IMAGE_TAG}" "${ECR_IMAGE_TAG}"
    echo -e "${GREEN}✅ Image tagged: ${ECR_IMAGE_TAG}${NC}"
    echo ""
fi

# Step 6: Push to ECR
if [[ "$SKIP_PUSH" == "false" ]]; then
    echo -e "${BLUE}Step 6: Pushing image to ECR...${NC}"
    docker push "${ECR_IMAGE_TAG}"
    echo -e "${GREEN}✅ Image pushed to ECR${NC}"
    echo ""
else
    echo -e "${YELLOW}⏭️  Skipping Docker push${NC}"
    echo ""
fi

# Summary
echo "=============================================="
echo "Setup Complete!"
echo "=============================================="
echo "Environment: ${ENVIRONMENT_NAME}"
echo "Component: ${COMPONENT_NAME}"
echo "Part Name: ${PART_NAME}"
echo "ECR Repository: ${ECR_REPO_URI}"
echo "Image Tag: ${IMAGE_TAG}"
echo "Full Image URI: ${ECR_IMAGE_TAG}"
echo "=============================================="

