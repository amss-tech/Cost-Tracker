# Tusco Cost Tracker

Electronic security project cost tracking — POs, invoices, uncommitted costs, and WIP comparison.

## Stack
- React + Vite (front-end)
- Supabase (Postgres + Auth)
- Netlify (hosting)

## First-time setup

### 1. Run the database schema
In Supabase → SQL Editor → New Query, paste and run the contents of `supabase_schema.sql`.

### 2. Create your first user
In Supabase → Authentication → Users → Invite user (or Add user).
Enter the email addresses for anyone who needs access.

### 3. Environment variables
Copy `.env.example` to `.env` and fill in your Supabase credentials.

For Netlify: go to Site Settings → Environment Variables and add:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 4. Local development
```bash
npm install
npm run dev
```

### 5. Deploy to Netlify
Connect this repo in the Netlify dashboard.
- Build command: `npm run build`
- Publish directory: `dist`
- Add environment variables in Site Settings

## Push workflow
```bash
git add . && git commit -m "your message" && git push
```
Netlify auto-deploys on push to main.

## Adding users
Supabase → Authentication → Users → Invite user by email.
They'll receive an email to set their password.
