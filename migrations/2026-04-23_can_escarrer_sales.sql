-- Run this in Supabase Dashboard → SQL Editor.
-- Creates the table + indexes for the Best Selling Products tab (Can Escarrer side).
-- One row = one line on an invoice. `bu` column separates DISTRIBUCION / SHOP / TASTING / SERVICES.
-- row_hash makes re-imports idempotent.

create extension if not exists "uuid-ossp";

create table if not exists public.can_escarrer_sales (
    id uuid default uuid_generate_v4() primary key,
    date date not null,
    bu text not null,                -- DISTRIBUCION | SHOP | TASTING | SERVICES
    serie text,
    cliente text,
    tipo_cliente text,               -- Restaurante | Tienda | Cliente directo
    origen text,                     -- INTERNO | EXTERNO
    descripcion text,                -- normalized UPPERCASE/trimmed, for grouping
    descripcion_raw text,            -- original casing, for display
    departamento text,
    seccion text,
    familia text,
    marca text,
    budget text,                     -- Budget category from CSV (FRESH PRODUCTS, etc.)
    uds numeric(10,3) default 0,
    importe numeric(12,2) default 0,
    precio_unitario numeric(12,4) default 0,
    row_hash text not null unique,
    imported_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_can_escarrer_sales_date          on public.can_escarrer_sales(date);
create index if not exists idx_can_escarrer_sales_bu            on public.can_escarrer_sales(bu);
create index if not exists idx_can_escarrer_sales_bu_date       on public.can_escarrer_sales(bu, date);
create index if not exists idx_can_escarrer_sales_departamento  on public.can_escarrer_sales(departamento);
create index if not exists idx_can_escarrer_sales_seccion       on public.can_escarrer_sales(seccion);
create index if not exists idx_can_escarrer_sales_marca         on public.can_escarrer_sales(marca);
create index if not exists idx_can_escarrer_sales_cliente       on public.can_escarrer_sales(cliente);

alter table public.can_escarrer_sales enable row level security;
create policy "Enable read access for all users"
    on public.can_escarrer_sales for select using (true);
