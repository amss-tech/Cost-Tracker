# Tusco ES — Self-Hosted Supabase Infrastructure

This directory contains everything needed to run both **Cost-Tracker** and **Esticomms** on a single self-hosted Supabase instance on Digital Ocean instead of Supabase Cloud.

**Monthly cost: ~$24/month flat** (1 droplet) vs. per-hour Supabase Cloud charges × 2 apps.

---

## Architecture

```
Netlify (free CDN)
  cost-tracker.netlify.app  ──┐
  esticomms.netlify.app    ───┤  HTTPS
                              ▼
Digital Ocean Droplet ($24/mo)
  Caddy (reverse proxy + auto SSL)
    └── Supabase Docker Compose
          ├── Kong (API gateway :8000)
          ├── GoTrue (auth — shared by both apps)
          ├── PostgREST (REST API — exposes both schemas)
          └── PostgreSQL 15
                ├── schema: public      ← Cost-Tracker tables
                └── schema: esticomms  ← Esticomms tables
```

Both apps share one Postgres server → bi-directional data access is native SQL with no sync needed.

---

## Files

| File | Purpose |
|------|---------|
| `docker-compose.override.yml` | PostgREST multi-schema config; restricts Postgres port exposure |
| `Caddyfile` | Reverse proxy config with auto SSL |
| `generate-keys.js` | Generates ANON_KEY + SERVICE_ROLE_KEY from your JWT_SECRET |
| `migrate.sh` | Exports from Supabase Cloud, imports to self-hosted |

---

## Step-by-Step Setup

### 1. Provision the Droplet

In Digital Ocean: **Create Droplet → Ubuntu 22.04 LTS → 4GB RAM / 2 vCPU (~$24/mo)**

Point your subdomain at the droplet IP:
```
A record: api.tusco-es.com → <droplet IP>
```

### 2. Install Docker on the Droplet

```bash
ssh root@<droplet-ip>
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
```

### 3. Set Up Self-Hosted Supabase

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

Edit `.env` — set these values:

```bash
POSTGRES_PASSWORD=<strong-random-password>
JWT_SECRET=<32+-char-random-string>
# Leave ANON_KEY and SERVICE_ROLE_KEY blank for now — generate them in step 4

SITE_URL=https://cost-tracker.netlify.app
API_EXTERNAL_URL=https://api.tusco-es.com
SUPABASE_PUBLIC_URL=https://api.tusco-es.com
```

Copy the override file:
```bash
# From your local machine:
scp infra/docker-compose.override.yml root@<droplet-ip>:~/supabase/docker/
```

### 4. Generate JWT Keys

On your local machine (needs Node.js):
```bash
cd infra
npm install jsonwebtoken
node generate-keys.js "your-jwt-secret-from-step-3"
```

Copy the output `ANON_KEY` and `SERVICE_ROLE_KEY` back into `supabase/docker/.env`.

### 5. Start Supabase

```bash
# On the droplet, in ~/supabase/docker/
docker compose up -d
docker compose ps   # all services should be "healthy" after ~60 seconds
```

### 6. Install Caddy + Configure SSL

```bash
# On the droplet:
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy -y

# Copy Caddyfile (edit the domain first):
scp infra/Caddyfile root@<droplet-ip>:/etc/caddy/Caddyfile
systemctl reload caddy
```

SSL is provisioned automatically. Test: `curl https://api.tusco-es.com/rest/v1/` should return JSON.

### 7. Migrate Cost-Tracker Data

Edit `infra/migrate.sh` — fill in your Supabase Cloud credentials and the target droplet password.

```bash
chmod +x infra/migrate.sh
./infra/migrate.sh
```

### 8. Migrate Esticomms Data

In the Esticomms repo, run the same script with:
```bash
CLOUD_HOST="db.<esticomms-project>.supabase.co"
TARGET_SCHEMA="esticomms"
```

The script will create the `esticomms` schema and rewrite the dump accordingly.

### 9. Update Netlify Environment Variables

For **both** Cost-Tracker and Esticomms on Netlify:
```
VITE_SUPABASE_URL=https://api.tusco-es.com
VITE_SUPABASE_ANON_KEY=<anon key from step 4>
```

Trigger a redeploy for both sites. Done.

---

## Bi-Directional Data Access

Since both apps share the same Postgres server, you can create cross-schema views or queries:

```sql
-- In Supabase Studio or psql:

-- Pull Cost-Tracker jobs into Esticomms
CREATE VIEW esticomms.ct_jobs AS
  SELECT id, job_number, job_description, status, estimated_revenue
  FROM public.jobs;

-- Link an estimate to a job
ALTER TABLE esticomms.estimates
  ADD COLUMN ct_job_id uuid REFERENCES public.jobs(id);
```

---

## Maintenance

| Task | Command |
|------|---------|
| Check service health | `docker compose ps` |
| View logs | `docker compose logs -f kong` |
| Update Supabase | `git pull && docker compose pull && docker compose up -d` |
| Backup database | `pg_dump postgresql://postgres:PASSWORD@localhost:5432/postgres > backup.sql` |
| Restart a service | `docker compose restart rest` |
