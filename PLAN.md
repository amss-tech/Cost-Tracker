# Tusco ES — Project Plan & Architecture Record

> Last updated: 2026-05-23  
> Covers: Cost-Tracker app, self-hosted backend migration, and Esticomms integration roadmap.

---

## 1. What We Built — Cost-Tracker Feature Summary

Cost-Tracker is a React + Supabase web app for tracking job costs at Tusco ES (electrical contractor).

### Core Features (shipped)
| Feature | File(s) |
|---------|---------|
| Job list, create, edit | `src/pages/Jobs.jsx`, `NewJob.jsx`, `EditJob.jsx` |
| Job detail — costs, POs, invoices, labor | `src/pages/JobDetail.jsx` |
| Billing entry + forecast | `src/pages/BillingEntry.jsx`, `BillingForecast.jsx` |
| PO entry | `src/pages/POEntry.jsx` |
| Invoice entry | `src/pages/InvoiceEntry.jsx` |
| Timecard import (CSV) | `src/pages/TimecardImport.jsx` |
| BOM import → auto-create POs | `src/pages/BOMImport.jsx` |
| Overhead hours | `src/pages/OverheadHours.jsx` |
| Daily field reports | `src/pages/FieldReport.jsx` |
| WIP Compare | `src/pages/WIPCompare.jsx` |
| WIP Import | `src/pages/WIPImport.jsx` |
| Uncommitted costs | `src/pages/UncommittedCosts.jsx` |
| Reports (billing, labor, job cost, cost forecast, WIP) | `src/pages/reports/` |
| Dashboard | `src/pages/Dashboard.jsx` |

### Key Bug Fixes
- **Budget double-counting** (`fix-budget-calculation` branch): PO costs and invoice costs were being counted twice when invoices existed against a PO. Fixed in `src/pages/JobDetail.jsx` — total cost now uses invoice amounts when available, falls back to PO committed amount when not invoiced.
- **Forecast auto-population**: Cost Forecast now pulls expected delivery dates from POs automatically.
- **Locked costs**: Costs can be locked to prevent editing after a billing period closes.

---

## 2. Self-Hosted Backend Migration

### Why
Supabase Cloud charges per project. Tusco ES has two apps (Cost-Tracker + Esticomms), each on a separate Supabase Cloud project. Moving both to one self-hosted stack saves money and enables direct cross-app database queries.

### Architecture

```
Netlify (free tier)
  cost-tracker.netlify.app  ──┐
  esticomms.netlify.app    ───┤  HTTPS
                              ▼
api.tusco-es.com  (Digital Ocean droplet — $24/month)
┌────────────────────────────────────────────────────┐
│  Caddy  (auto-SSL, reverse proxy)                  │
│    /rest/v1/*  → PostgREST :3000                  │
│    /auth/v1/*  → GoTrue    :9999                  │
├────────────────────────────────────────────────────┤
│  Postgres 15                                       │
│    schema: public       — Cost-Tracker data        │
│    schema: esticomms    — Esticomms data           │
│    schema: auth         — GoTrue users/sessions    │
└────────────────────────────────────────────────────┘
```

**Key insight**: The Supabase JS client (`@supabase/supabase-js`) works unchanged. PostgREST implements the same REST API that Supabase Cloud uses. Only two env vars change per app:
```
VITE_SUPABASE_URL=https://api.tusco-es.com
VITE_SUPABASE_ANON_KEY=<generated from your JWT secret>
```

### Stack (4 containers)

| Container | Image | Purpose |
|-----------|-------|---------|
| `db` | `postgres:15` | The actual database |
| `rest` | `postgrest/postgrest:v12.2.0` | REST API layer |
| `auth` | `supabase/gotrue:v2.151.0` | JWT auth |
| `caddy` | `caddy:2` | Reverse proxy + auto-SSL |

Config lives in `infra/docker-compose.yml`.

### Cost Comparison

| Item | Before | After |
|------|--------|-------|
| Supabase Cloud (Cost-Tracker) | ~$25/mo | $0 (cancelled) |
| Supabase Cloud (Esticomms) | ~$25/mo | $0 (cancelled) |
| Digital Ocean 4GB droplet | $0 | $24/mo |
| Netlify (both frontends) | Free | Free |
| **Total** | **~$50/mo** | **$24/mo** |

---

## 3. Migration Checklist

Steps to complete the migration from Supabase Cloud → self-hosted. Do these in order.

### Phase 1 — Provision Server
- [ ] Create Digital Ocean droplet: Ubuntu 22.04 LTS, 4GB RAM / 2 vCPU ($24/mo)
- [ ] Add SSH key during creation
- [ ] Set DNS A record: `api.tusco-es.com → <droplet IP>`
- [ ] SSH in and install Docker: `curl -fsSL https://get.docker.com | sh`

### Phase 2 — Configure Stack
- [ ] Clone repo on droplet: `git clone https://github.com/amss-tech/Cost-Tracker.git`
- [ ] `cd Cost-Tracker/infra && cp .env.example .env`
- [ ] Generate secrets and fill in `.env`:
  ```bash
  openssl rand -base64 24   # → POSTGRES_PASSWORD
  openssl rand -hex 32      # → JWT_SECRET
  ```
- [ ] On local machine, generate JWT keys:
  ```bash
  cd infra && npm install jsonwebtoken
  node generate-keys.js "your-jwt-secret"
  ```
  Copy `ANON_KEY` and `SERVICE_ROLE_KEY` into `.env` on the droplet.
- [ ] Set `DOMAIN=api.tusco-es.com` and `SITE_URL` in `.env`
- [ ] `docker compose up -d` (wait ~60s for Postgres to initialize)
- [ ] Verify: `docker compose ps` — all 4 services healthy

### Phase 3 — Migrate Cost-Tracker Data
- [ ] Edit `infra/migrate.sh`:
  - `CLOUD_HOST` = Supabase Dashboard → Project Settings → Database → Host
  - `CLOUD_PASSWORD` = your Supabase DB password
  - `TARGET_HOST=api.tusco-es.com`
  - `TARGET_PASSWORD` = POSTGRES_PASSWORD from `.env`
  - `TARGET_SCHEMA=public`
- [ ] Run: `chmod +x infra/migrate.sh && ./infra/migrate.sh`
- [ ] Verify data: `curl https://api.tusco-es.com/rest/v1/jobs`

### Phase 4 — Migrate Esticomms Data
- [ ] Edit `infra/migrate.sh` for Esticomms project:
  - `CLOUD_HOST` = Esticomms Supabase project host
  - `TARGET_SCHEMA=esticomms`
- [ ] Run: `./infra/migrate.sh`

### Phase 5 — Update Both Apps
**Cost-Tracker** (Netlify env vars):
- [ ] `VITE_SUPABASE_URL=https://api.tusco-es.com`
- [ ] `VITE_SUPABASE_ANON_KEY=<ANON_KEY from generate-keys.js>`
- [ ] Trigger deploy on Netlify

**Esticomms** (Netlify env vars — same values):
- [ ] `VITE_SUPABASE_URL=https://api.tusco-es.com`
- [ ] `VITE_SUPABASE_ANON_KEY=<same ANON_KEY>`
- [ ] One code change in Esticomms `src/lib/supabase.js`:
  ```js
  export const supabase = createClient(url, anonKey, {
    db: { schema: 'esticomms' }
  })
  ```
- [ ] Trigger deploy on Netlify

### Phase 6 — Verify & Cut Over
- [ ] Log into Cost-Tracker — all data present, auth works
- [ ] Log into Esticomms — all data present, auth works
- [ ] Cancel both Supabase Cloud projects

---

## 4. Esticomms Integration — Future Roadmap

Esticomms is a separate React app (estimating tool). Since both apps now share the same Postgres, future integration features are straightforward.

### "Create Project" Button (planned)
When an estimate is won, a button in Esticomms will create a job record directly in Cost-Tracker's `public.jobs` table.

**Implementation (when ready):**
1. Look at `supabase_schema.sql` (or `infra/init.sql`) to identify required fields in `public.jobs`
2. Map estimate fields → job fields
3. Call `supabase.from('jobs').insert({...})` from Esticomms with `{ db: { schema: 'public' } }` override
4. Decide how to handle `job_number` — auto-generate from estimate number, or leave blank for office staff

**Key decision to make later:** `job_number` in Cost-Tracker is typically user-entered (e.g. `2630-24`). When Esticomms creates the job, either auto-generate it or leave it blank and let office staff fill it in.

### Cross-App SQL (available today, no code needed)
```sql
-- Link an estimate to a Cost-Tracker job
ALTER TABLE esticomms.estimates
  ADD COLUMN ct_job_id uuid REFERENCES public.jobs(id);

-- View active/pipeline jobs from within Esticomms
CREATE VIEW esticomms.ct_jobs AS
  SELECT id, job_number, job_description, status, estimated_revenue
  FROM public.jobs
  WHERE status IN ('Active', 'Pipeline');
```

---

## 5. Day-to-Day Server Operations

```bash
# SSH into droplet
ssh root@api.tusco-es.com

# Navigate to the stack
cd Cost-Tracker/infra

# Check container status
docker compose ps

# View logs
docker compose logs -f             # all containers
docker compose logs -f rest        # PostgREST only
docker compose logs -f auth        # GoTrue only

# Restart a service
docker compose restart rest

# Update to newer versions
docker compose pull && docker compose up -d

# Daily/weekly backup
docker compose exec db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T db psql -U postgres postgres < backup_20260523.sql
```

### Create a New User
```bash
curl -X POST https://api.tusco-es.com/auth/v1/admin/users \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@tusco-es.com","password":"initial-password","email_confirm":true}'
```

---

## 6. Key Files Reference

| File | Purpose |
|------|---------|
| `infra/docker-compose.yml` | 4-container stack definition |
| `infra/Caddyfile` | Caddy reverse proxy config |
| `infra/init.sql` | Postgres schema + RLS policies (runs on first boot) |
| `infra/migrate.sh` | Data migration script (Supabase Cloud → self-hosted) |
| `infra/generate-keys.js` | Generates ANON_KEY and SERVICE_ROLE_KEY from JWT secret |
| `infra/.env.example` | All required environment variables with documentation |
| `supabase_schema.sql` | Full Cost-Tracker schema (reference copy) |
| `src/lib/supabase.js` | Supabase client initialization |
| `COST-TRACKER-GUIDE.md` | User guide for APM / office staff |
