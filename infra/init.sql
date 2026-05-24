-- =============================================================================
-- Tusco ES — Postgres initialization for PostgREST
--
-- This file runs ONCE when the Postgres container is first created.
-- It sets up the roles PostgREST needs to serve requests.
--
-- How PostgREST role switching works:
--   1. PostgREST connects to Postgres as the superuser (postgres)
--   2. For each HTTP request, it does SET LOCAL ROLE based on the JWT:
--      - Valid JWT with role='authenticated' → runs as authenticated role
--      - No JWT / ANON_KEY JWT with role='anon' → runs as anon role
--   3. Postgres RLS policies check the current role before allowing queries
-- =============================================================================

-- Role for unauthenticated / public requests
CREATE ROLE anon NOLOGIN;

-- Role for logged-in users
CREATE ROLE authenticated NOLOGIN;

-- Allow the postgres superuser to switch into these roles
GRANT anon TO postgres;
GRANT authenticated TO postgres;

-- =============================================================================
-- Public schema (Cost-Tracker)
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Allow authenticated users full CRUD on all current and future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;

-- Allow anon users read-only (no sensitive data exposed without login
-- because RLS policies require authenticated role anyway)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

-- =============================================================================
-- Esticomms schema
-- Created here so PostgREST can expose it from the start.
-- Tables are populated by the migration script.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS esticomms;

GRANT USAGE ON SCHEMA esticomms TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA esticomms
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA esticomms
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA esticomms
  GRANT SELECT ON TABLES TO anon;
