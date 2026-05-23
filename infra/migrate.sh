#!/usr/bin/env bash
# =============================================================================
# Tusco ES — Supabase Cloud → Self-Hosted Migration Script
# =============================================================================
#
# Run this from your LOCAL MACHINE (needs psql, pg_dump, pg_restore installed).
# Fill in the variables in the CONFIG section before running.
#
# What this does:
#   1. Exports Cost-Tracker schema + data from Supabase Cloud
#   2. Exports auth users from Supabase Cloud
#   3. Imports everything into your self-hosted Supabase on Digital Ocean
#
# For Esticomms: run the same script with CLOUD_DB_* pointing at the
# Esticomms Supabase project, and set TARGET_SCHEMA=esticomms.
# =============================================================================

set -euo pipefail

# ===========================================================================
# CONFIG — fill these in before running
# ===========================================================================

# --- Supabase Cloud source (Cost-Tracker project) ---
# Find these in: Supabase Dashboard → Project Settings → Database → Connection string
CLOUD_HOST="db.XXXXXXXXXXXX.supabase.co"
CLOUD_PORT="5432"
CLOUD_DB="postgres"
CLOUD_USER="postgres"
CLOUD_PASSWORD="your-supabase-cloud-db-password"

# --- Self-hosted Supabase target (Digital Ocean droplet) ---
TARGET_HOST="api.tusco-es.com"   # or use the droplet IP during setup
TARGET_PORT="5432"               # direct Postgres port (NOT the Kong 8000 port)
TARGET_DB="postgres"
TARGET_USER="postgres"
TARGET_PASSWORD="your-self-hosted-db-password"

# --- Schema config ---
# For Cost-Tracker: use "public"
# For Esticomms:    use "esticomms"
TARGET_SCHEMA="public"

# ===========================================================================
# DERIVED — don't edit below here
# ===========================================================================

CLOUD_DSN="postgresql://${CLOUD_USER}:${CLOUD_PASSWORD}@${CLOUD_HOST}:${CLOUD_PORT}/${CLOUD_DB}"
TARGET_DSN="postgresql://${TARGET_USER}:${TARGET_PASSWORD}@${TARGET_HOST}:${TARGET_PORT}/${TARGET_DB}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="./supabase_migration_${TIMESTAMP}"
mkdir -p "$DUMP_DIR"

echo "=== Tusco ES Supabase Migration ==="
echo "Source: ${CLOUD_HOST}"
echo "Target: ${TARGET_HOST} (schema: ${TARGET_SCHEMA})"
echo "Output: ${DUMP_DIR}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Export schema from Supabase Cloud (public schema only, no auth)
# ---------------------------------------------------------------------------
echo "[1/5] Exporting schema from Supabase Cloud..."
pg_dump "$CLOUD_DSN" \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-acl \
  --exclude-table="public.schema_migrations" \
  -f "${DUMP_DIR}/01_schema.sql"
echo "      → ${DUMP_DIR}/01_schema.sql"

# ---------------------------------------------------------------------------
# Step 2: Export data from Supabase Cloud
# ---------------------------------------------------------------------------
echo "[2/5] Exporting data from Supabase Cloud..."
pg_dump "$CLOUD_DSN" \
  --schema=public \
  --data-only \
  --no-owner \
  --no-acl \
  -f "${DUMP_DIR}/02_data.sql"
echo "      → ${DUMP_DIR}/02_data.sql"

# ---------------------------------------------------------------------------
# Step 3: Export auth users (email + hashed passwords — no plaintext)
# ---------------------------------------------------------------------------
echo "[3/5] Exporting auth users..."
pg_dump "$CLOUD_DSN" \
  --schema=auth \
  --table="auth.users" \
  --table="auth.identities" \
  --data-only \
  --no-owner \
  --no-acl \
  -f "${DUMP_DIR}/03_auth_users.sql"
echo "      → ${DUMP_DIR}/03_auth_users.sql"

# ---------------------------------------------------------------------------
# Step 4: Create target schema if needed (for Esticomms)
# ---------------------------------------------------------------------------
if [ "$TARGET_SCHEMA" != "public" ]; then
  echo "[4/5] Creating schema '${TARGET_SCHEMA}' on target..."
  psql "$TARGET_DSN" <<SQL
CREATE SCHEMA IF NOT EXISTS ${TARGET_SCHEMA};
GRANT USAGE ON SCHEMA ${TARGET_SCHEMA} TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${TARGET_SCHEMA}
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${TARGET_SCHEMA}
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
SQL
  # Rewrite the dump to target schema
  sed -i "s/SET search_path = public/SET search_path = ${TARGET_SCHEMA}/g" "${DUMP_DIR}/01_schema.sql"
  sed -i "s/public\\./${TARGET_SCHEMA}./g" "${DUMP_DIR}/01_schema.sql"
  sed -i "s/SET search_path = public/SET search_path = ${TARGET_SCHEMA}/g" "${DUMP_DIR}/02_data.sql"
else
  echo "[4/5] Skipping schema creation (using 'public')..."
fi

# ---------------------------------------------------------------------------
# Step 5: Import into self-hosted Supabase
# ---------------------------------------------------------------------------
echo "[5/5] Importing schema + data into self-hosted Supabase..."
psql "$TARGET_DSN" -f "${DUMP_DIR}/01_schema.sql"
psql "$TARGET_DSN" -f "${DUMP_DIR}/02_data.sql"
psql "$TARGET_DSN" -f "${DUMP_DIR}/03_auth_users.sql"

echo ""
echo "=== Migration complete! ==="
echo ""
echo "Next steps:"
echo "  1. Test login at https://api.tusco-es.com"
echo "  2. Update Netlify env vars:"
echo "       VITE_SUPABASE_URL=https://api.tusco-es.com"
echo "       VITE_SUPABASE_ANON_KEY=<your generated anon key>"
echo "  3. Trigger a Netlify redeploy for Cost-Tracker"
echo "  4. Smoke test all pages"
echo "  5. Once confirmed working: pause/delete the Supabase Cloud project"
