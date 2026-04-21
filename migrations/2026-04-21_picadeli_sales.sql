-- Run this in Supabase Dashboard → SQL Editor.
-- Creates the table + indexes for the Best Selling Products (Picadeli) tab.
-- RLS is enabled with a public-read policy; the import script will bypass
-- RLS temporarily if needed (same pattern as sales_daily_def).

create extension if not exists "uuid-ossp";

create table if not exists public.picadeli_sales (
    id uuid default uuid_generate_v4() primary key,
    date date not null,
    hour smallint,
    serie text,
    cliente text,
    descripcion text,            -- normalized UPPERCASE/trimmed, for grouping
    descripcion_raw text,        -- original casing, for display
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

create index if not exists idx_picadeli_sales_date           on public.picadeli_sales(date);
create index if not exists idx_picadeli_sales_date_desc      on public.picadeli_sales(date, descripcion);
create index if not exists idx_picadeli_sales_departamento   on public.picadeli_sales(departamento);
create index if not exists idx_picadeli_sales_seccion        on public.picadeli_sales(seccion);
create index if not exists idx_picadeli_sales_marca_mapeada  on public.picadeli_sales(marca_mapeada);
create index if not exists idx_picadeli_sales_hour           on public.picadeli_sales(hour);

-- Keep RLS OFF during the initial import (run from a local script with the anon key).
-- Once the import finishes, re-enable with:
--
--   alter table public.picadeli_sales enable row level security;
--   create policy "Enable read access for all users"
--     on public.picadeli_sales for select using (true);
