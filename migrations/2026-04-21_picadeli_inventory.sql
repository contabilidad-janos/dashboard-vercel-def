-- Inventory snapshots table for Picadeli/Juntos Deli retail.
-- Each monthly CSV import becomes one snapshot (identified by snapshot_date).
-- Joins to picadeli_sales via articulo_normalized = picadeli_sales.descripcion.

create extension if not exists "uuid-ossp";

create table if not exists public.picadeli_inventory (
    id uuid default uuid_generate_v4() primary key,
    snapshot_date date not null,
    departamento text,
    proveedor text,
    articulo text not null,
    articulo_normalized text not null,
    precio_unidad numeric(10,2),
    stock_units numeric(10,3) default 0,
    stock_value numeric(12,2) default 0,
    imported_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique (snapshot_date, articulo_normalized)
);

create index if not exists idx_picadeli_inventory_snapshot on public.picadeli_inventory(snapshot_date);
create index if not exists idx_picadeli_inventory_articulo on public.picadeli_inventory(articulo_normalized);

alter table public.picadeli_inventory enable row level security;

do $$ begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'picadeli_inventory'
          and policyname = 'Enable read access for all users'
    ) then
        create policy "Enable read access for all users"
            on public.picadeli_inventory for select using (true);
    end if;
end $$;
