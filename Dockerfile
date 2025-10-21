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

RUN yarn run build

# Stage 3: Runner (Production)
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat aws-cli jq
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built application and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Create startup script that fetches env vars from Parameter Store at RUNTIME
COPY start.sh /app/start.sh

# Make startup script executable
RUN chmod +x /app/start.sh

# Change ownership
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Set entrypoint to fetch env vars and then run the app
ENTRYPOINT ["/app/start.sh"]
CMD ["node", "dist/main.js"]
