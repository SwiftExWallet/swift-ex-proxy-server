# Multi-stage Dockerfile for SwiftEX Proxy Server
# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create placeholder Firebase service account file for build (will be replaced at runtime)
RUN mkdir -p src/api/v1/notification/firebase && \
    echo '{"type": "service_account", "project_id": "placeholder", "private_key_id": "placeholder", "private_key": "-----BEGIN PRIVATE KEY-----\\nPLACEHOLDER_KEY\\n-----END PRIVATE KEY-----\\n", "client_email": "placeholder@placeholder.iam.gserviceaccount.com", "client_id": "placeholder", "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs", "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/placeholder%40placeholder.iam.gserviceaccount.com"}' > src/api/v1/notification/firebase/firebaseServiceAccount.json

RUN yarn run build

# Stage 3: Runner (Production)
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat aws-cli jq bash
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built application and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy startup script and constants file
COPY start.sh /app/start.sh
COPY constants.sh /app/constants.sh

# Make startup script executable (constants.sh doesn't need execute permission - it's sourced)
RUN chmod +x /app/start.sh && chmod 644 /app/constants.sh

# Change ownership
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Set entrypoint to fetch env vars and then run the app
ENTRYPOINT ["/app/start.sh"]
CMD ["node", "dist/main.js"]
