-- ============================================================================
--  Unify chat_search_products on group_article_sales (ALL BUs, data through the
--  latest ICG export). Before, it read only picadeli_sales + can_escarrer_sales,
--  which are imported separately and were stale (saffron example: chat claimed
--  "no sales since May 1 2026" while the unified table had 103 sale lines
--  through Jul 8 — Distribution kept buying AZAFRÁN | SAFFRON weekly).
--
--  Also accent-insensitive: group_article_sales keeps accents (AZAFRÁN), so a
--  plain ilike 'azafran' would miss them. translate() folds both sides.
--  Returns one row per (product × BU): source = canonical BU name.
-- ============================================================================
create or replace function public.chat_search_products(q text)
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
    and translate(upper(g.descripcion), 'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ', 'AEIOUAEIOUAEIOUAEIOUN')
        like '%' || translate(upper(trim(q)), 'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ', 'AEIOUAEIOUAEIOUAEIOUN') || '%'
  group by g.bu, g.descripcion
  order by sum(g.importe) desc nulls last
  limit 60;
$$;

grant execute on function public.chat_search_products(text) to anon, authenticated;
