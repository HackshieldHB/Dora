# syntax=docker/dockerfile:1.7
#
# Release image for one client installation. Build it with scripts/release/build-release.ps1,
# which passes the client id, a build id and the vendor signing key (as a BuildKit secret, so the
# key never lands in an image layer). The final image holds only the compiled, obfuscated and
# signed standalone server: no source code, no tests, no seed data, no secrets.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tar \
 && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 \
    NPM_CONFIG_FETCH_RETRIES=5 NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

# ---- dependencies (cached separately from the source) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Prisma CLI for schema sync on start (kept apart from the app's node_modules) ----
FROM base AS prismacli
WORKDIR /opt/prisma
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund --omit=dev prisma@6.19.3 \
 && npm cache clean --force

# ---- build, obfuscate, sign ----
FROM base AS builder
ARG DORA_CLIENT_ID
ARG DORA_BUILD_ID
ARG DORA_ALLOWED_ORIGINS=""
ENV DORA_RELEASE=1 NODE_ENV=production \
    DORA_CLIENT_ID=${DORA_CLIENT_ID} DORA_BUILD_ID=${DORA_BUILD_ID} DORA_ALLOWED_ORIGINS=${DORA_ALLOWED_ORIGINS}
RUN test -n "$DORA_CLIENT_ID" && test -n "$DORA_BUILD_ID" \
 || (echo "Build args DORA_CLIENT_ID and DORA_BUILD_ID are required." >&2 && exit 1)
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN grep -q "BEGIN PUBLIC KEY" src/lib/license-public-key.ts \
 || (echo "src/lib/license-public-key.ts has no key. Run npm run license:keygen first." >&2 && exit 1)
RUN npx prisma generate && npx next build
# Next.js copies .env files and traced folders into standalone; strip anything that is not code.
RUN rm -rf .next/standalone/.env .next/standalone/.env.* .next/standalone/storage .next/standalone/license \
           .next/standalone/prisma .next/standalone/src .next/standalone/scripts \
 && find .next/standalone -name "*.map" -delete \
 && cp -r .next/static .next/standalone/.next/static \
 && if [ -d public ]; then cp -r public .next/standalone/public; fi
RUN npx esbuild scripts/setup-production.ts scripts/encrypt-data.ts scripts/backup.ts scripts/restore.ts \
      --bundle --platform=node --target=node22 --format=cjs --outdir=.next/standalone/tools \
      --external:@prisma/client --external:bcryptjs --log-level=warning
RUN npx tsx scripts/release/obfuscate.ts --root .next/standalone
RUN --mount=type=secret,id=dora_signing_key,required=true \
    npx tsx scripts/release/sign-integrity.ts --root .next/standalone --key /run/secrets/dora_signing_key

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/dora.db DORA_LICENSE_FILE=/app/license/dora.lic
RUN groupadd --system --gid 1001 dora \
 && useradd --system --uid 1001 --gid dora --home-dir /nonexistent --shell /usr/sbin/nologin dora
# Application files belong to root and are read-only for the app user: the running process
# cannot rewrite its own code. Only data folders are writable.
COPY --from=prismacli /opt/prisma /opt/prisma
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY docker/entrypoint.sh /usr/local/bin/dora-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/dora-entrypoint && chmod 0755 /usr/local/bin/dora-entrypoint \
 && mkdir -p /data /app/storage/uploads /app/storage/imports /app/license /app/.next/cache /backups \
 && chown -R dora:dora /data /app/storage /app/.next/cache /backups \
 && chmod -R go-w /app
USER dora
EXPOSE 3000
VOLUME ["/data", "/app/storage"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["dora-entrypoint"]
