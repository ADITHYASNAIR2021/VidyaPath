# ── VidyaPath Production Dockerfile ──
# Build: docker build -t vidyapath .
# Run:   docker run -p 3000:3000 --env-file .env.local vidyapath

FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# ── Dependencies ──
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# ── Build ──
FROM base AS builder
COPY . .
RUN npm ci --ignore-scripts
RUN npm run build

# ── Runtime ──
FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib/context ./lib/context
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["npx", "next", "start"]
