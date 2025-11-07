#!/bin/bash

# Fetch SSM Parameters and create local .env file
# Usage: ./fetch-ssm.sh [-p <profile>] [-o <output-file>]

set -e

# Load constants
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/constants.sh"

# Default values
AWS_PROFILE=""
OUTPUT_FILE=".env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--profile) AWS_PROFILE="$2"; shift 2 ;;
    -o|--output) OUTPUT_FILE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [-p <profile>] [-o <output-file>]"
      echo "  -p, --profile    AWS profile to use"
      echo "  -o, --output     Output file (default: .env)"
      exit 0
      ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# Set profile option
PROFILE_OPT=""
if [[ -n "$AWS_PROFILE" ]]; then
    PROFILE_OPT="--profile $AWS_PROFILE"
    export AWS_PROFILE="$AWS_PROFILE"
fi

echo "=============================================="
echo "Fetching SSM Parameters"
echo "SSM Base Path: ${SSM_BASE_PATH}"
echo "Output File: ${OUTPUT_FILE}"
[[ -n "$AWS_PROFILE" ]] && echo "AWS Profile: ${AWS_PROFILE}"
echo "=============================================="
echo ""

# Create .env file
echo "# Environment Configuration" > "${OUTPUT_FILE}"
echo "# Auto-generated from SSM Parameter Store" >> "${OUTPUT_FILE}"
echo "# Generated at: $(date)" >> "${OUTPUT_FILE}"
echo "AWS_REGION=${AWS_REGION}" >> "${OUTPUT_FILE}"
echo "" >> "${OUTPUT_FILE}"

# Get all parameters
PARAM_NAMES=$(aws ssm describe-parameters \
    --parameter-filters "Key=Name,Option=BeginsWith,Values=${SSM_BASE_PATH}/" \
    --region "${AWS_REGION}" \
    ${PROFILE_OPT} \
    --query 'Parameters[].Name' \
    --output text 2>/dev/null || echo "")

if [[ -z "$PARAM_NAMES" ]]; then
    echo -e "${YELLOW}⚠️  No parameters found at path ${SSM_BASE_PATH}/${NC}"
    echo "The ${OUTPUT_FILE} file has been created with basic configuration."
    exit 0
fi

# Process each parameter
while read -r param_name; do
    [[ -z "$param_name" ]] && continue
    
    # Get parameter key (basename)
    param_key=$(basename "$param_name")
    
    # Convert to uppercase for environment variable (proxy uses uppercase)
    env_var_name=$(echo "$param_key" | tr '[:lower:]' '[:upper:]')
    
    # Get parameter value
    param_value=$(aws ssm get-parameter \
        --name "$param_name" \
        --with-decryption \
        --region "${AWS_REGION}" \
        ${PROFILE_OPT} \
        --query 'Parameter.Value' \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$param_value" ]]; then
        echo "${env_var_name}=${param_value}" >> "${OUTPUT_FILE}"
        echo -e "${GREEN}✅ ${env_var_name}${NC}"
    else
        echo -e "${YELLOW}⚠️  Failed to get value for: ${param_name}${NC}"
    fi
done < <(echo "$PARAM_NAMES" | tr '\t' '\n')

# Count variables (subtract header lines: 3 header + 1 blank = 4)
TOTAL_VARS=$(($(wc -l < "${OUTPUT_FILE}" | tr -d ' ') - 4))

echo ""
echo "=============================================="
echo "Summary: ${TOTAL_VARS} variables fetched"
echo "Output file: ${OUTPUT_FILE}"
echo "=============================================="

