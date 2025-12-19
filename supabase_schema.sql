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
