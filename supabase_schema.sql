-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Business Units Table
-- Stores static configuration for each unit (Labels, Spend Types, etc.)
create table public.business_units (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique, -- 'Juntos house', 'Picadeli', etc.
  spend_type text not null, -- 'SPP' (Pax), 'SPT' (Ticket), 'SPO' (Order)
  unit_label text not null, -- 'Pax', 'Tickets', 'Orders'
  target_spend numeric default 0, -- Estimated budget factor for volume/spend extrapolation
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Sales Records Table
-- Granular sales data. Optimized for daily uploads from Google Sheets via n8n.
create table public.sales_records (
  id uuid default uuid_generate_v4() primary key,
  date date not null,
  business_unit_id uuid references public.business_units(id) not null,
  amount numeric default 0, -- Total Sales in Euro
  transactions integer default 0, -- Volume (Pax/Tickets/Orders)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(date, business_unit_id) -- Prevent duplicate entries for the same day/unit
);

-- 3. Budget Targets Table
-- Monthly budget targets.
create table public.budget_targets (
  id uuid default uuid_generate_v4() primary key,
  month date not null, -- Stored as first day of the month (e.g., 2025-01-01)
  business_unit_id uuid references public.business_units(id) not null,
  target_amount numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(month, business_unit_id)
);

-- RLS Policies (Row Level Security) - Optional but recommended
alter table public.business_units enable row level security;
alter table public.sales_records enable row level security;
alter table public.budget_targets enable row level security;

-- Public read access (since it's a dashboard)
create policy "Enable read access for all users" on public.business_units for select using (true);
create policy "Enable read access for all users" on public.sales_records for select using (true);
create policy "Enable read access for all users" on public.budget_targets for select using (true);

-- 4. Picadeli Sales Table
-- Transactional line-level data (one row = one product sold in one hour on one POS).
-- Source: Google Sheets export "VENTAS PICADELI - VENTAS PICA.csv".
-- row_hash makes re-imports idempotent.
create table public.picadeli_sales (
  id uuid default uuid_generate_v4() primary key,
  date date not null,
  hour smallint,
  serie text,
  cliente text,
  descripcion text,           -- normalized (UPPERCASE, trimmed) for grouping
  descripcion_raw text,       -- original casing for display
  departamento text,
  seccion text,
  familia text,
  marca text,
  marca_mapeada text,
  uds numeric(10,3) default 0,
  importe numeric(12,2) default 0,
  row_hash text not null unique,
  imported_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_picadeli_sales_date on public.picadeli_sales(date);
create index if not exists idx_picadeli_sales_date_desc on public.picadeli_sales(date, descripcion);
create index if not exists idx_picadeli_sales_departamento on public.picadeli_sales(departamento);
create index if not exists idx_picadeli_sales_seccion on public.picadeli_sales(seccion);
create index if not exists idx_picadeli_sales_marca_mapeada on public.picadeli_sales(marca_mapeada);
create index if not exists idx_picadeli_sales_hour on public.picadeli_sales(hour);

alter table public.picadeli_sales enable row level security;
create policy "Enable read access for all users" on public.picadeli_sales for select using (true);
