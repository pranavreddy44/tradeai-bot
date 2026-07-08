# Stage 1: Build Next.js standalone
FROM node:20-alpine AS next-builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package*.json ./
RUN npm ci
COPY . .
# Run db generate before build to compile prisma models
RUN npx prisma generate
RUN npm run build

# Stage 2: Build Bun mini-service
FROM oven/bun:alpine AS bun-builder
WORKDIR /app
COPY mini-services/telegram-listener/package*.json ./mini-services/telegram-listener/
COPY mini-services/telegram-listener/bun.lock ./mini-services/telegram-listener/
WORKDIR /app/mini-services/telegram-listener
RUN bun install --frozen-lockfile
COPY mini-services/telegram-listener/ ./

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install Bun in runner (since we need it to execute telegram listener)
RUN apk add --no-cache bash curl lsof \
    && curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun

# Copy Next.js standalone built files
COPY --from=next-builder /app/.next/standalone ./
COPY --from=next-builder /app/.next/static ./.next/static
COPY --from=next-builder /app/public ./public
COPY --from=next-builder /app/prisma ./prisma
COPY --from=next-builder /app/process-manager.js ./process-manager.js
COPY --from=next-builder /app/package.json ./package.json

# Copy Bun listener service and its dependencies
COPY --from=bun-builder /app/mini-services/telegram-listener ./mini-services/telegram-listener

EXPOSE 3000 3002

CMD ["node", "process-manager.js", "prod"]
