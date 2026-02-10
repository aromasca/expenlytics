# Stage 1: Build the application
FROM node:22 AS builder
WORKDIR /app

# Copy dependency files first for better caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1
# Enable standalone output for Docker
ENV BUILD_STANDALONE=true

RUN npm run build

# Stage 2: Production server
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create data directory with correct permissions
RUN mkdir -p data && chown nextjs:nodejs data

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

VOLUME ["/app/data"]

CMD ["node", "server.js"]
