#!/usr/bin/env bash
# =============================================================================
# Tusco ES — Supabase Cloud → Self-Hosted Migration Script
# =============================================================================
#
# Run from your LOCAL MACHINE (needs psql and pg_dump installed).
# Fill in the CONFIG section before running.
#
# What this does:
#   1. Exports schema + data from Supabase Cloud (public schema)
#   2. Exports auth users from Supabase Cloud
#   3. Imports into self-hosted Postgres on Digital Ocean
#   4. Grants role permissions on imported tables
#
# To migrate Esticomms: set CLOUD_HOST to the Esticomms project and
# set TARGET_SCHEMA=esticomms, then re-run.
# =============================================================================

set -euo pipefail

# ===========================================================================
# CONFIG — fill these in before running
# ===========================================================================

# --- Supabase Cloud source ---
# Project Settings → Database → Connection string → URI
# Format: db.XXXXXXXXXXXX.supabase.co
CLOUD_HOST="db.XXXXXXXXXXXX.supabase.co"
CLOUD_PORT="5432"
CLOUD_DB="postgres"
CLOUD_USER="postgres"
CLOUD_PASSWORD="your-supabase-cloud-db-password"

# --- Self-hosted target ---
TARGET_HOST="api.tusco-es.com"  # your droplet domain or IP
TARGET_PORT="5432"              # direct Postgres port (NOT the 80/443 Caddy port)
TARGET_DB="postgres"
TARGET_USER="postgres"
TARGET_PASSWORD="your-self-hosted-db-password-from-.env"

# --- Schema ---
# Cost-Tracker:  TARGET_SCHEMA=public
# Esticomms:     TARGET_SCHEMA=esticomms
TARGET_SCHEMA="public"

# ===========================================================================
# SCRIPT — don't edit below
# ===========================================================================

CLOUD_DSN="postgresql://${CLOUD_USER}:${CLOUD_PASSWORD}@${CLOUD_HOST}:${CLOUD_PORT}/${CLOUD_DB}"
TARGET_DSN="postgresql://${TARGET_USER}:${TARGET_PASSWORD}@${TARGET_HOST}:${TARGET_PORT}/${TARGET_DB}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="./migration_${TIMESTAMP}"
mkdir -p "$DUMP_DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  Tusco ES Supabase Migration         ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Source:  ${CLOUD_HOST}"
echo "  Target:  ${TARGET_HOST} → schema '${TARGET_SCHEMA}'"
echo "  Dumps:   ${DUMP_DIR}/"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Export app schema (DDL only, no auth tables)
# ---------------------------------------------------------------------------
echo "[1/5] Exporting schema from Supabase Cloud..."
pg_dump "$CLOUD_DSN" \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-acl \
  --no-privileges \
  -f "${DUMP_DIR}/01_schema.sql"
echo "      ✓ ${DUMP_DIR}/01_schema.sql"

# ---------------------------------------------------------------------------
# Step 2: Export data
# ---------------------------------------------------------------------------
echo "[2/5] Exporting data from Supabase Cloud..."
pg_dump "$CLOUD_DSN" \
  --schema=public \
  --data-only \
  --no-owner \
  --no-acl \
  -f "${DUMP_DIR}/02_data.sql"
echo "      ✓ ${DUMP_DIR}/02_data.sql"

# ---------------------------------------------------------------------------
# Step 3: Export auth users (hashed passwords — no plaintext)
# ---------------------------------------------------------------------------
echo "[3/5] Exporting auth users..."
pg_dump "$CLOUD_DSN" \
  --table="auth.users" \
  --table="auth.identities" \
  --data-only \
  --no-owner \
  --no-acl \
  -f "${DUMP_DIR}/03_auth_users.sql" 2>/dev/null || {
    echo "      ⚠ Could not export auth.users (may need service role access)"
    echo "        Users will need to reset passwords after migration."
    touch "${DUMP_DIR}/03_auth_users.sql"
  }
echo "      ✓ ${DUMP_DIR}/03_auth_users.sql"

# ---------------------------------------------------------------------------
# Step 4: Rewrite schema to target schema if not 'public'
# ---------------------------------------------------------------------------
if [ "$TARGET_SCHEMA" != "public" ]; then
  echo "[4/5] Rewriting schema name: public → ${TARGET_SCHEMA}..."
  sed -i.bak \
    -e "s/SET search_path = public/SET search_path = ${TARGET_SCHEMA}/g" \
    -e "s/ public\\./ ${TARGET_SCHEMA}./g" \
    "${DUMP_DIR}/01_schema.sql" "${DUMP_DIR}/02_data.sql"
  echo "      ✓ Schema rewritten"
else
  echo "[4/5] Skipping schema rewrite (target is 'public')."
fi

# ---------------------------------------------------------------------------
# Step 5: Import into self-hosted Postgres
# ---------------------------------------------------------------------------
echo "[5/5] Importing into self-hosted Postgres..."

psql "$TARGET_DSN" -f "${DUMP_DIR}/01_schema.sql"
echo "      ✓ Schema imported"

psql "$TARGET_DSN" -f "${DUMP_DIR}/02_data.sql"
echo "      ✓ Data imported"

if [ -s "${DUMP_DIR}/03_auth_users.sql" ]; then
  psql "$TARGET_DSN" -f "${DUMP_DIR}/03_auth_users.sql" 2>/dev/null || \
    echo "      ⚠ Auth user import failed — users may need to reset passwords"
  echo "      ✓ Auth users imported"
fi

# Grant permissions on the newly-imported tables
# (ALTER DEFAULT PRIVILEGES in init.sql covers future tables, not these existing ones)
echo "      Granting role permissions on imported tables..."
psql "$TARGET_DSN" <<SQL
GRANT ALL ON ALL TABLES IN SCHEMA ${TARGET_SCHEMA} TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA ${TARGET_SCHEMA} TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA ${TARGET_SCHEMA} TO anon;
SQL
echo "      ✓ Permissions granted"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  Migration complete!                 ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Verify data: psql \"${TARGET_DSN}\" -c 'SELECT count(*) FROM ${TARGET_SCHEMA}.jobs;'"
echo "  2. Update Netlify env vars:"
echo "       VITE_SUPABASE_URL=https://${TARGET_HOST}"
echo "       VITE_SUPABASE_ANON_KEY=<anon key from generate-keys.js>"
echo "  3. Trigger a Netlify redeploy for both apps"
echo "  4. Test login and all pages"
echo "  5. Once confirmed: pause/delete the Supabase Cloud project"
echo ""
