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
# The production build uses development-time tooling such as cross-env,
# TypeScript, Tailwind, and the Next.js compiler. NODE_ENV is inherited from
# the base stage, so request these packages explicitly for the builder only.
RUN npm ci --include=dev --ignore-scripts
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

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const j=await r.json();process.exit(r.ok&&j.status==='ok'?0:1)}).catch(e=>{console.error(e);process.exit(1)})"]

CMD ["npx", "next", "start"]
