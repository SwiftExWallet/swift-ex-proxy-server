#!/bin/bash

# Set SSM Parameters from Local JSON File
# Usage: ./setssmparameter.sh [-p <profile>] [-f <json-file>]

set -e

# Load constants
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/constants.sh"

# Default values
AWS_PROFILE=""
SSM_VALUES_FILE="ssmvalues.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--profile) AWS_PROFILE="$2"; shift 2 ;;
    -f|--file) SSM_VALUES_FILE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [-p <profile>] [-f <json-file>]"
      exit 0
      ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# Check jq
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required${NC}"
    exit 1
fi

# Check file exists
[[ ! -f "$SSM_VALUES_FILE" ]] && echo -e "${RED}Error: File not found: $SSM_VALUES_FILE${NC}" && exit 1

# Validate JSON
! jq empty "$SSM_VALUES_FILE" 2>/dev/null && echo -e "${RED}Error: Invalid JSON${NC}" && exit 1

# Set profile option
PROFILE_OPT=""
[[ -n "$AWS_PROFILE" ]] && PROFILE_OPT="--profile $AWS_PROFILE" && export AWS_PROFILE="$AWS_PROFILE"

echo "=============================================="
echo "Setting SSM Parameters"
echo "SSM Base Path: ${SSM_BASE_PATH}"
echo "Values File: ${SSM_VALUES_FILE}"
[[ -n "$AWS_PROFILE" ]] && echo "AWS Profile: ${AWS_PROFILE}"
echo "=============================================="
echo ""

SUCCESS=0
FAILED=0

# Process each parameter
while IFS='|' read -r key type value; do
    [[ -z "$key" ]] && continue
    
    [[ "$type" != "String" && "$type" != "SecureString" ]] && \
        echo -e "${YELLOW}⚠️  Skipping ${key}: Invalid type${NC}" && ((FAILED++)) && continue
    
    PARAM_NAME="${SSM_BASE_PATH}/${key}"
    
    # Check if exists
    EXISTS=$(aws ssm describe-parameters \
        --parameter-filters "Key=Name,Values=${PARAM_NAME}" \
        --region "${AWS_REGION}" \
        ${PROFILE_OPT} \
        --query 'Parameters[0].Name' \
        --output text 2>/dev/null || echo "")
    
    if [[ "$EXISTS" == "${PARAM_NAME}" ]]; then
        echo -e "${YELLOW}📝 Updating: ${PARAM_NAME}${NC}"
    else
        echo -e "${GREEN}➕ Creating: ${PARAM_NAME}${NC}"
    fi
    
    # Set parameter
    if aws ssm put-parameter \
        --name "${PARAM_NAME}" \
        --value "${value}" \
        --type "${type}" \
        --overwrite \
        --region "${AWS_REGION}" \
        ${PROFILE_OPT} \
        --output text > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Success${NC}"
        ((SUCCESS++))
    else
        echo -e "   ${RED}❌ Failed${NC}"
        ((FAILED++))
    fi
    echo ""
done < <(jq -r 'to_entries[] | "\(.key)|\(.value.type)|\(.value.value)"' "$SSM_VALUES_FILE")

# Summary
echo "=============================================="
echo "Summary: ${SUCCESS} success, ${FAILED} failed"
echo "=============================================="

[[ $FAILED -gt 0 ]] && exit 1
