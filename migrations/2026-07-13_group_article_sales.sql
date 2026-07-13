-- ============================================================================
--  group_article_sales  —  article-level sales for the WHOLE group
--  Source: ICG Access export "VENTASARTICULOS" (query fixed 2026-07-13 to use
--  the LINE amount dbo_ALBVENTALIN.TOTAL, net/sin IVA, instead of the document
--  header total). One row = one (date, serie, cliente, product, dept, seccion,
--  familia) group. `bu` is derived from NUMSERIE with the canonical mapping.
--
--  Run this ONCE in Supabase Dashboard → SQL Editor. Then the local importer
--  (scripts/import_group_articles.js) fills it via the anon key, idempotently.
--
--  This ADDS product-level data for Juntos house & Juntos boutique (which had
--  none). Existing picadeli_sales / can_escarrer_sales and the BestSelling
--  Products UI are left untouched.
-- ============================================================================

create table if not exists public.group_article_sales (
    id             uuid default gen_random_uuid() primary key,
    date           date not null,
    bu             text not null,          -- canonical BU from NUMSERIE
    numserie       text,
    area_negocio   text,
    cliente        text,
    descripcion    text,                   -- normalized UPPER/trim, for grouping
    descripcion_raw text,                  -- original casing, for display
    departamento   text,
    seccion        text,
    familia        text,
    uds            numeric(14,3) default 0,
    importe        numeric(14,2) default 0,  -- NET revenue (sin IVA)
    row_hash       text not null unique,
    imported_at    timestamptz default now() not null
);

create index if not exists idx_gas_date         on public.group_article_sales(date);
create index if not exists idx_gas_bu           on public.group_article_sales(bu);
create index if not exists idx_gas_bu_date      on public.group_article_sales(bu, date);
create index if not exists idx_gas_descripcion  on public.group_article_sales(descripcion);
create index if not exists idx_gas_departamento on public.group_article_sales(departamento);

-- RLS: public read; anon may write (same trust model as sales_daily_def /
-- sales_records / picadeli_sales, which the weekly importers already write to).
alter table public.group_article_sales enable row level security;

drop policy if exists gas_read   on public.group_article_sales;
drop policy if exists gas_insert on public.group_article_sales;
drop policy if exists gas_update on public.group_article_sales;

create policy gas_read   on public.group_article_sales for select using (true);
create policy gas_insert on public.group_article_sales for insert with check (true);
create policy gas_update on public.group_article_sales for update using (true) with check (true);

grant select, insert, update on public.group_article_sales to anon, authenticated;

-- ============================================================================
--  Extend chat_top_products_by_bu to cover Juntos house & Juntos boutique from
--  the new table. Picadeli / Tasting / Farm shop / Distribution keep reading
--  their existing tables (so the chat stays consistent with BestSellingProducts).
-- ============================================================================
create or replace function public.chat_top_products_by_bu(
  bu_name text,
  start_date date default '2024-01-01',
  end_date date default '2030-12-31',
  limit_n int default 10
)
returns table (descripcion_raw text, total_uds numeric, total_revenue numeric, line_count bigint, source text)
language sql security definer as $$
  with src as (
    -- Picadeli (unchanged)
    select descripcion_raw, uds::numeric as uds, importe::numeric as importe, date, 'picadeli'::text as source
    from public.picadeli_sales
    where (bu_name ilike '%picadeli%' or bu_name ilike '%juntos deli%')
      and date between start_date and end_date
    union all
    -- Can Escarrer: tasting / farm shop / distribution (unchanged)
    select descripcion_raw, uds::numeric as uds, importe::numeric as importe, date, lower(c.bu)::text as source
    from public.can_escarrer_sales c
    where (
      (bu_name ilike '%tasting%'      and c.bu = 'TASTING')
      or (bu_name ilike '%farm shop%' and c.bu = 'SHOP')
      or (bu_name ilike '%distribution%' and c.bu = 'DISTRIBUCION')
    )
    and c.date between start_date and end_date
    union all
    -- NEW: Juntos house & Juntos boutique from group_article_sales
    select g.descripcion_raw, g.uds::numeric as uds, g.importe::numeric as importe, g.date, ('group:' || g.bu)::text as source
    from public.group_article_sales g
    where (
      (bu_name ilike '%house%'    and g.bu = 'Juntos house')
      or (bu_name ilike '%boutique%' and g.bu = 'Juntos boutique')
    )
    and g.date between start_date and end_date
  )
  select descripcion_raw,
         sum(uds) as total_uds,
         sum(importe) as total_revenue,
         count(*)::bigint as line_count,
         max(source) as source
  from src
  where descripcion_raw is not null and length(trim(descripcion_raw)) > 0
  group by descripcion_raw
  order by sum(importe) desc nulls last
  limit greatest(coalesce(limit_n, 10), 1);
$$;

grant execute on function public.chat_top_products_by_bu(text, date, date, int) to anon, authenticated;
