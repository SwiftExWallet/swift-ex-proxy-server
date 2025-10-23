#!/bin/sh
set -e

# Default values
ENVIRONMENT_NAME="${ENVIRONMENT_NAME:-dev}"
COMPONENT_NAME="${COMPONENT_NAME:-swiftx}"
PART_NAME="${PART_NAME:-proxy}"
AWS_REGION="${AWS_REGION:-ap-south-1}"

# Base path for parameters
PARAM_BASE_PATH="/${ENVIRONMENT_NAME}/${COMPONENT_NAME}/${PART_NAME}"

echo "Fetching environment variables from Parameter Store at runtime..."
echo "Base path: ${PARAM_BASE_PATH}"

# Create .env file dynamically from all parameters
echo "# Environment Configuration" > /app/.env
echo "AWS_REGION=${AWS_REGION}" >> /app/.env

# Get all parameters and create .env file
# TEMP: Add profile for local testing (comment out for production)
AWS_PROFILE_OPT=""
if [[ -n "${AWS_PROFILE:-}" ]]; then
    AWS_PROFILE_OPT="--profile ${AWS_PROFILE}"
fi

# Get parameter names
param_names=$(aws ssm describe-parameters \
    --parameter-filters "Key=Name,Option=BeginsWith,Values=${PARAM_BASE_PATH}/" \
    --region "${AWS_REGION}" \
    ${AWS_PROFILE_OPT} \
    --query 'Parameters[].Name' \
    --output text 2>/dev/null || echo "")

if [[ -z "$param_names" ]]; then
    echo "Warning: No parameters found at path ${PARAM_BASE_PATH}/"
    echo "This might be due to missing AWS credentials or incorrect path"
else
    echo "Found parameters, processing..."
    echo "$param_names" | tr '\t' '\n' | while read param_name; do
        if [[ -n "$param_name" ]]; then
            param_key=$(basename "$param_name")
            # Convert parameter name to uppercase for environment variable
            env_var_name=$(echo "$param_key" | tr '[:lower:]' '[:upper:]')
            param_value=$(aws ssm get-parameter \
                --name "$param_name" \
                --with-decryption \
                --region "${AWS_REGION}" \
                ${AWS_PROFILE_OPT} \
                --query 'Parameter.Value' \
                --output text 2>/dev/null || echo "")
            if [[ -n "$param_value" ]]; then
                echo "${env_var_name}=${param_value}" >> /app/.env
                echo "Added: ${env_var_name}=${param_value}"
            else
                echo "Failed to get value for: ${param_name}"
            fi
        fi
    done
fi

echo "Environment variables fetched and .env file created successfully!"
echo "Total variables: $(wc -l < /app/.env)"

# Fetch Firebase service account from S3 and replace placeholder
echo "Fetching Firebase service account from S3..."
mkdir -p /app/src/api/v1/notification/firebase

# Try to fetch from S3, keep placeholder if not available
aws s3 cp s3://dev-swiftx-secrets/firebase-service-account.json /app/src/api/v1/notification/firebase/firebaseServiceAccount.json 2>/dev/null && {
    echo "Firebase service account downloaded from S3"
} || {
    echo "Firebase service account not found in S3, using placeholder..."
}

echo "Firebase service account file ready"
echo "Starting application..."

# Execute the command passed to the container
exec "$@"
