FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://melodarr:melodarr@db:5432/melodarr

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --no-fund

FROM deps AS builder
COPY . .
# Optional subpath support (e.g. /melodarr) for reverse proxy deployments.
# Must be provided at build time since Next.js bakes basePath into the build output.
ARG BASE_PATH=""
ENV BASE_PATH=${BASE_PATH}
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# `next start` re-reads next.config.ts at server startup (not just at build time), so the
# same BASE_PATH used to build the client assets must also be present at runtime, or the
# server won't enforce basePath-prefixed routing. Bake in the build-time value as the
# container's default; it can still be overridden at runtime, but only to match a rebuild
# with the same BASE_PATH — changing it without rebuilding will break static asset URLs.
ARG BASE_PATH=""
ENV BASE_PATH=${BASE_PATH}
RUN apk upgrade --no-cache openssl musl zlib

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
COPY --from=builder /app/styles ./styles
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh
EXPOSE 3000

CMD ["/entrypoint.sh"]
