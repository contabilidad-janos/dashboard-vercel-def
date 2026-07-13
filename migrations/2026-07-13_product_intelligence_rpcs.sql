-- ============================================================================
--  Product Intelligence RPCs — server-side aggregation over group_article_sales
--  so the dashboard never pulls ~196k raw rows. Two functions:
--   pi_products         → per (product × BU) totals for a date range (powers the
--                         cross-channel, Pareto, menu-engineering and price views)
--   pi_product_monthly  → per (BU × month) for ONE product (cross-channel drill +
--                         seasonality)
--  Revenue is NET (sin IVA). Grouped by normalized descripcion so the same
--  article matches across channels.
-- ============================================================================

create or replace function public.pi_products(
  start_date date default '2024-01-01',
  end_date   date default '2030-12-31'
)
returns table (descripcion text, name text, dept text, bu text, uds numeric, rev numeric)
language sql security definer
set statement_timeout to '20000'
as $$
  select g.descripcion,
         max(nullif(g.descripcion_raw, '')) as name,
         max(nullif(g.departamento, ''))    as dept,
         g.bu,
         round(sum(g.uds), 2)     as uds,
         round(sum(g.importe), 2) as rev
  from public.group_article_sales g
  where g.descripcion <> '' and g.bu <> 'OTROS'
    and g.date between start_date and end_date
  group by g.descripcion, g.bu;
$$;

create or replace function public.pi_product_monthly(
  product    text,
  start_date date default '2024-01-01',
  end_date   date default '2030-12-31'
)
returns table (bu text, ym text, uds numeric, rev numeric)
language sql security definer
set statement_timeout to '20000'
as $$
  select g.bu,
         to_char(g.date, 'YYYY-MM') as ym,
         round(sum(g.uds), 2)       as uds,
         round(sum(g.importe), 2)   as rev
  from public.group_article_sales g
  where upper(trim(g.descripcion)) = upper(trim(product))
    and g.bu <> 'OTROS'
    and g.date between start_date and end_date
  group by g.bu, to_char(g.date, 'YYYY-MM');
$$;

grant execute on function public.pi_products(date, date) to anon, authenticated;
grant execute on function public.pi_product_monthly(text, date, date) to anon, authenticated;
