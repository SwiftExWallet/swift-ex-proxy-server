#!/bin/bash
set -e

# Source constants file for consistent configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/constants.sh" ]; then
    source "${SCRIPT_DIR}/constants.sh"
else
    # Fallback to defaults if constants.sh not found
    export ENVIRONMENT_NAME="${ENVIRONMENT_NAME:-dev}"
    export COMPONENT_NAME="${COMPONENT_NAME:-swiftx}"
    export PART_NAME="${PART_NAME:-proxy}"
    export AWS_REGION="${AWS_REGION:-ap-south-1}"
fi

# Use SSM_BASE_PATH from constants.sh, fallback to computed value
PARAM_BASE_PATH="${SSM_BASE_PATH:-/${ENVIRONMENT_NAME}/${COMPONENT_NAME}/${PART_NAME}}"

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
mkdir -p /app/dist/api/v1/notification/firebase

# Remove any existing placeholder file first
rm -f /app/dist/api/v1/notification/firebase/firebaseServiceAccount.json

# Try to fetch from S3, keep placeholder if not available
aws s3 cp s3://dev-swiftx-secrets/firebase-service-account.json /app/dist/api/v1/notification/firebase/firebaseServiceAccount.json $AWS_PROFILE_OPT 2>/dev/null && {
    echo "Firebase service account downloaded from S3"
    echo "Firebase service account file ready"
} || {
    echo "Firebase service account not found in S3, using placeholder..."
    # Create a minimal placeholder if S3 download fails
    echo '{"type": "service_account", "project_id": "placeholder", "private_key_id": "placeholder", "private_key": "-----BEGIN PRIVATE KEY-----\\nPLACEHOLDER_KEY\\n-----END PRIVATE KEY-----\\n", "client_email": "placeholder@placeholder.iam.gserviceaccount.com", "client_id": "placeholder", "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs", "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/placeholder%40placeholder.iam.gserviceaccount.com"}' > /app/dist/api/v1/notification/firebase/firebaseServiceAccount.json
    echo "Placeholder Firebase service account file created"
}

echo "Firebase service account file ready"

# Debug: Check what's actually in the Firebase file
echo "Debug: Checking Firebase file content..."
if [ -f "/app/dist/api/v1/notification/firebase/firebaseServiceAccount.json" ]; then
    echo "Firebase file exists, checking client_email..."
    CLIENT_EMAIL=$(cat /app/dist/api/v1/notification/firebase/firebaseServiceAccount.json | jq -r '.client_email' 2>/dev/null || echo "JSON_PARSE_ERROR")
    echo "Client email in file: $CLIENT_EMAIL"
    if [[ "$CLIENT_EMAIL" == "placeholder@placeholder.iam.gserviceaccount.com" ]]; then
        echo "ERROR: Still using placeholder Firebase credentials!"
        exit 1
    elif [[ "$CLIENT_EMAIL" == "firebase-adminsdk-oheag@proxy-server-99cc2.iam.gserviceaccount.com" ]]; then
        echo "SUCCESS: Real Firebase credentials found!"
    else
        echo "WARNING: Unexpected client_email: $CLIENT_EMAIL"
    fi
else
    echo "ERROR: Firebase file does not exist!"
    exit 1
fi

echo "Starting application..."

# Execute the command passed to the container
exec "$@"
