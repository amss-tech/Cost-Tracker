-- ============================================================
-- Tusco Cost Tracker — Supabase Schema
-- Run this in Supabase → SQL Editor → New Query
-- ============================================================

-- JOBS
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  job_type text,
  project_manager text,
  job_description text,
  jtd_billing numeric(12,2) default 0,
  jtd_cost numeric(12,2) default 0,
  estimated_revenue numeric(12,2) default 0,
  estimated_cost numeric(12,2) default 0,
  estimated_margin numeric(12,2) default 0,
  estimated_margin_pct numeric(6,4) default 0,
  estimated_completion_date date,
  pct_complete numeric(6,4) default 0,
  notes text,
  prev_estimated_revenue numeric(12,2) default 0,
  prev_estimated_cost numeric(12,2) default 0,
  prev_estimated_margin numeric(12,2) default 0,
  prev_estimated_margin_pct numeric(6,4) default 0,
  revenue_change numeric(12,2) default 0,
  cost_change numeric(12,2) default 0,
  wip_period text,
  source text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PURCHASE ORDERS
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  po_number text,
  vendor text not null,
  amount numeric(12,2) not null default 0,
  category text,
  date_issued date,
  expected_invoice_date date,
  delivery_status text default 'Not Ordered',
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- INVOICES
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  po_id uuid references purchase_orders(id) on delete set null,
  vendor_invoice_number text,
  vendor text,
  amount numeric(12,2) not null default 0,
  date_received date,
  foundation_status text default 'Pending — Not in Foundation',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- UNCOMMITTED COSTS
create table if not exists uncommitted_costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  category text not null,
  description text,
  cost_date date,
  hours numeric(8,2),
  rate numeric(8,2),
  amount numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- CHANGE ORDERS
create table if not exists change_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  co_number text,
  description text not null,
  revenue_amount numeric(12,2) default 0,
  cost_amount numeric(12,2) default 0,
  status text default 'Pending',
  date_submitted date,
  date_approved date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger co_updated_at before update on change_orders
  for each row execute function update_updated_at();

alter table change_orders enable row level security;
create policy "auth_all_cos" on change_orders for all to authenticated using (true) with check (true);

-- WIP IMPORTS (audit log)
create table if not exists wip_imports (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  imported_at timestamptz default now(),
  job_count int default 0,
  updated_count int default 0,
  conflict_count int default 0,
  imported_by uuid references auth.users(id)
);

-- UPDATED_AT trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger jobs_updated_at before update on jobs
  for each row execute function update_updated_at();
create trigger pos_updated_at before update on purchase_orders
  for each row execute function update_updated_at();
create trigger invoices_updated_at before update on invoices
  for each row execute function update_updated_at();

-- RLS POLICIES
alter table jobs enable row level security;
alter table purchase_orders enable row level security;
alter table invoices enable row level security;
alter table uncommitted_costs enable row level security;
alter table wip_imports enable row level security;

-- Authenticated users can do everything
create policy "auth_all_jobs" on jobs for all to authenticated using (true) with check (true);
create policy "auth_all_pos" on purchase_orders for all to authenticated using (true) with check (true);
create policy "auth_all_invoices" on invoices for all to authenticated using (true) with check (true);
create policy "auth_all_uncommitted" on uncommitted_costs for all to authenticated using (true) with check (true);
create policy "auth_all_wip_imports" on wip_imports for all to authenticated using (true) with check (true);
