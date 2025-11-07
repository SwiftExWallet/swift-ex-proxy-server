#!/bin/bash
# Constants for Proxy Service
# This file defines environment configuration that can be overridden by environment variables

# Environment Configuration
export ENVIRONMENT_NAME="${ENVIRONMENT_NAME:-dev}"
export COMPONENT_NAME="${COMPONENT_NAME:-swiftx}"
export PART_NAME="${PART_NAME:-proxy}"
export AWS_REGION="${AWS_REGION:-ap-south-1}"

# Derived values
export SSM_BASE_PATH="/${ENVIRONMENT_NAME}/${COMPONENT_NAME}/${PART_NAME}"
export ECR_REPO_NAME="${ENVIRONMENT_NAME}-${COMPONENT_NAME}-${PART_NAME}-ecr"

# Display configuration
echo "Configuration:" >&2
echo "  Environment: ${ENVIRONMENT_NAME}" >&2
echo "  Component: ${COMPONENT_NAME}" >&2
echo "  Part Name: ${PART_NAME}" >&2
echo "  AWS Region: ${AWS_REGION}" >&2
echo "  SSM Base Path: ${SSM_BASE_PATH}" >&2

