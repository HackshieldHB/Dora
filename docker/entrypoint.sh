#!/bin/sh
# Starts DORA inside the release image: checks required settings, brings the database schema up to
# date (refusing any change that would lose data), then hands over to the Next.js server.
set -eu

if [ -z "${DORA_DATA_KEY:-}" ]; then
  echo "DORA_DATA_KEY is not set. Add it to the .env file next to docker-compose.yml." >&2
  exit 1
fi

if [ ! -s "${DORA_LICENSE_FILE:-/app/license/dora.lic}" ] && [ -z "${DORA_LICENSE:-}" ]; then
  echo "Warning: no license file at ${DORA_LICENSE_FILE:-/app/license/dora.lic}. DORA will start but nobody can sign in." >&2
fi

mkdir -p /app/storage/uploads /app/storage/imports

# `db push` applies additive schema changes and stops with an error instead of dropping data.
node /opt/prisma/node_modules/prisma/build/index.js db push --skip-generate --schema /app/prisma/schema.prisma

exec node server.js
