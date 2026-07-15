-- ============================================================================
--  chat_search_products with an optional date range. "Sales of X since <date>"
--  questions need per-product date-filtered totals: all-history search rows
--  made the model infer recent activity from last_sold (error-prone), and
--  top_products misses low-price items (a €5 infusion never cracks top 10).
--  Drop the 1-arg version to avoid PostgREST overload ambiguity; the 3-arg
--  version keeps {q}-only calls working via defaults.
-- ============================================================================
drop function if exists public.chat_search_products(text);

create or replace function public.chat_search_products(
  q text,
  start_date date default '2024-01-01',
  end_date   date default '2030-12-31'
)
returns table (
    source text,
    descripcion_raw text,
    total_uds numeric,
    total_revenue numeric,
    line_count bigint,
    first_sold date,
    last_sold date
)
language sql security definer
set statement_timeout to '15000'
as $$
  select g.bu as source,
         max(nullif(g.descripcion_raw, '')) as descripcion_raw,
         round(sum(g.uds), 2)               as total_uds,
         round(sum(g.importe), 2)           as total_revenue,
         count(*)::bigint                   as line_count,
         min(g.date)                        as first_sold,
         max(g.date)                        as last_sold
  from public.group_article_sales g
  where g.bu <> 'OTROS'
    and g.date between start_date and end_date
    and translate(upper(g.descripcion), 'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ', 'AEIOUAEIOUAEIOUAEIOUN')
        like '%' || translate(upper(trim(q)), 'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ', 'AEIOUAEIOUAEIOUAEIOUN') || '%'
  group by g.bu, g.descripcion
  order by sum(g.importe) desc nulls last
  limit 60;
$$;

grant execute on function public.chat_search_products(text, date, date) to anon, authenticated;
