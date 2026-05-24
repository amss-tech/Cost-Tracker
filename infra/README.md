# Tusco ES — Self-Hosted Backend

Replaces Supabase Cloud with **Postgres running directly in Docker** on a single $24/month Digital Ocean droplet. Both Cost-Tracker and Esticomms use the same server.

**The Supabase JS client in both apps works unchanged — only two env vars change per app.**

---

## Why 4 containers, not just Postgres?

A React browser app can't connect directly to Postgres (Postgres speaks a binary protocol, not HTTP). Two thin open-source HTTP services bridge the gap:

| Container | Image | Purpose | What it replaces |
|-----------|-------|---------|-----------------|
| `db` | `postgres:15` | **The actual database** | Supabase Cloud Postgres |
| `rest` | `postgrest/postgrest` | REST API — converts tables to HTTP | Supabase REST API |
| `auth` | `supabase/gotrue` | JWT auth — login/logout/sessions | Supabase Auth |
| `caddy` | `caddy:2` | Reverse proxy + auto SSL | — |

PostgREST and GoTrue are independent open-source tools (MIT licensed). They cost nothing to run.

---

## Architecture

```
Netlify (free)
  cost-tracker.netlify.app  ──┐
  esticomms.netlify.app    ───┤  HTTPS
                              ▼
api.tusco-es.com  (Digital Ocean droplet, $24/mo)
┌────────────────────────────────────────────────┐
│  Caddy  (auto-SSL, routes by path)             │
│    /rest/v1/*  → PostgREST :3000              │
│    /auth/v1/*  → GoTrue    :9999              │
├────────────────────────────────────────────────┤
│  Postgres 15                                   │
│    schema: public       — Cost-Tracker data    │
│    schema: esticomms    — Esticomms data       │
│    schema: auth         — GoTrue users/tokens  │
└────────────────────────────────────────────────┘
```

One auth system for both apps. Cross-app data = native SQL, no sync needed.

---

## Setup (one time)

### 1. Create Droplet

On Digital Ocean: **Ubuntu 22.04 LTS · 4GB RAM / 2 vCPU · $24/month**

- Add your SSH key during creation
- Once created, get the IP and set a DNS A record: `api.tusco-es.com → <IP>`

### 2. Install Docker

```bash
ssh root@<droplet-ip>
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
```

### 3. Get the stack

```bash
git clone https://github.com/amss-tech/Cost-Tracker.git
cd Cost-Tracker/infra
```

### 4. Configure

```bash
cp .env.example .env
nano .env   # fill in POSTGRES_PASSWORD, JWT_SECRET, DOMAIN, SITE_URL
```

Generate the two secrets:
```bash
# Generate a strong Postgres password
openssl rand -base64 24

# Generate a 32-char JWT secret
openssl rand -hex 32
```

### 5. Generate JWT keys

On your **local machine** (not the droplet — needs Node.js):
```bash
cd infra
npm install jsonwebtoken
node generate-keys.js "your-jwt-secret-from-.env"
```

Copy the `ANON_KEY` and `SERVICE_ROLE_KEY` output back into `.env` on the droplet.

### 6. Start the stack

```bash
# Back on the droplet, in Cost-Tracker/infra/
docker compose up -d

# Watch startup (takes ~30s for Postgres to initialize)
docker compose logs -f --tail 20
```

All 4 services should show `healthy` after ~60 seconds:
```bash
docker compose ps
```

### 7. Migrate Cost-Tracker data

On your **local machine** — edit `migrate.sh` and fill in:
- `CLOUD_HOST` — from Supabase Dashboard → Project Settings → Database
- `CLOUD_PASSWORD` — your Supabase DB password
- `TARGET_HOST` — `api.tusco-es.com`
- `TARGET_PASSWORD` — the `POSTGRES_PASSWORD` from `.env`
- `TARGET_SCHEMA=public`

Then run:
```bash
chmod +x infra/migrate.sh
./infra/migrate.sh
```

### 8. Migrate Esticomms data

Same script, different settings:
```bash
# In migrate.sh:
CLOUD_HOST="db.<esticomms-project>.supabase.co"
CLOUD_PASSWORD="esticomms-cloud-password"
TARGET_SCHEMA="esticomms"

./infra/migrate.sh
```

### 9. Update Netlify env vars

For **both apps** on Netlify (Site Settings → Build & Deploy → Environment Variables):

```
VITE_SUPABASE_URL=https://api.tusco-es.com
VITE_SUPABASE_ANON_KEY=<the ANON_KEY from generate-keys.js>
```

Click "Trigger deploy" on both sites. Done.

**Esticomms only** — one code change in `src/lib/supabase.js`:
```js
export const supabase = createClient(url, anonKey, {
  db: { schema: 'esticomms' }
})
```

### 10. Verify

```bash
# On the droplet:
docker compose ps                                # all 4 healthy
curl https://api.tusco-es.com/rest/v1/jobs      # returns job list
curl https://api.tusco-es.com/auth/v1/health    # returns {"status":"pass"}
```

Log into Cost-Tracker and Esticomms — everything should work as before.

---

## Bi-Directional Data (Cost-Tracker ↔ Esticomms)

Both apps share the same Postgres. Cross-app queries are native SQL:

```sql
-- Connect an estimate to a Cost-Tracker job:
ALTER TABLE esticomms.estimates
  ADD COLUMN ct_job_id uuid REFERENCES public.jobs(id);

-- View Cost-Tracker jobs from Esticomms:
CREATE VIEW esticomms.ct_jobs AS
  SELECT id, job_number, job_description, status, estimated_revenue
  FROM public.jobs
  WHERE status IN ('Active', 'Pipeline');
```

---

## Day-to-Day Operations

```bash
# Check status
docker compose ps

# View logs
docker compose logs -f rest      # PostgREST logs
docker compose logs -f auth      # GoTrue logs

# Restart a service
docker compose restart rest

# Update to newer versions
docker compose pull
docker compose up -d

# Database backup
docker compose exec db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

# Restore a backup
docker compose exec -T db psql -U postgres postgres < backup_20260523.sql
```

## Create a new user (admin)

GoTrue auto-confirm is on, so users don't need email verification.
Create users via the GoTrue API (from the droplet):

```bash
curl -X POST https://api.tusco-es.com/auth/v1/admin/users \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@tusco-es.com","password":"initial-password","email_confirm":true}'
```

---

## Cost Summary

| Item | Monthly |
|------|---------|
| Digital Ocean 4GB droplet | $24 |
| Netlify (both frontends) | Free |
| Supabase Cloud | $0 (cancel both projects) |
| **Total** | **$24/month** |
