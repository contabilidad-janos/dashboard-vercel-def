-- ============================================================================
--  Product Intelligence — materialized view pre-aggregated per (product × BU ×
--  year) so the dashboard reads a few thousand small rows instead of running a
--  196k-row aggregate on every load (which hit the anon statement_timeout and
--  the 1000-row PostgREST cap). Powers the cross-channel, Pareto, menu-eng and
--  price views. Seasonality still uses pi_product_monthly (per-product, on
--  demand). Revenue is NET (sin IVA).
--
--  Refresh after each article import via pi_refresh() (SECURITY DEFINER so the
--  anon importer can call it).
-- ============================================================================

drop materialized view if exists public.pi_product_bu_year cascade;

create materialized view public.pi_product_bu_year as
  select g.descripcion,
         max(nullif(g.descripcion_raw, ''))       as name,
         max(nullif(g.departamento, ''))          as dept,
         max(nullif(g.seccion, ''))               as seccion,
         g.bu,
         extract(year from g.date)::int           as yr,
         round(sum(g.uds), 2)                     as uds,
         round(sum(g.importe), 2)                 as rev
  from public.group_article_sales g
  where g.descripcion <> '' and g.bu <> 'OTROS'
  group by g.descripcion, g.bu, extract(year from g.date);

create index if not exists idx_pi_mv_descripcion on public.pi_product_bu_year(descripcion);
create index if not exists idx_pi_mv_bu          on public.pi_product_bu_year(bu);
create index if not exists idx_pi_mv_yr          on public.pi_product_bu_year(yr);

grant select on public.pi_product_bu_year to anon, authenticated;

create or replace function public.pi_refresh()
returns void
language plpgsql security definer
set statement_timeout to '60000'
as $$
begin
  refresh materialized view public.pi_product_bu_year;
end;
$$;

grant execute on function public.pi_refresh() to anon, authenticated;
