-- ============================================================================
--  chat_product_daily — day-by-day sales for products matching a term.
--  The chat FABRICATED a daily breakdown for saffron (invented 3 days that
--  summed to the true total, anchored on first/last_sold) because no tool
--  returned per-day product detail. One row per (date × product × BU).
--  Accent-insensitive like chat_search_products. Cap 1000 rows (use a specific
--  term + bounded range).
-- ============================================================================
create or replace function public.chat_product_daily(
  q text,
  start_date date default '2024-01-01',
  end_date   date default '2030-12-31'
)
returns table (
    date date,
    bu text,
    descripcion_raw text,
    uds numeric,
    revenue numeric
)
language sql security definer
set statement_timeout to '15000'
as $$
  select g.date,
         g.bu,
         max(nullif(g.descripcion_raw, '')) as descripcion_raw,
         round(sum(g.uds), 2)               as uds,
         round(sum(g.importe), 2)           as revenue
  from public.group_article_sales g
  where g.bu <> 'OTROS'
    and g.date between start_date and end_date
    and translate(upper(g.descripcion), 'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ', 'AEIOUAEIOUAEIOUAEIOUN')
        like '%' || translate(upper(trim(q)), 'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ', 'AEIOUAEIOUAEIOUAEIOUN') || '%'
  group by g.date, g.bu, g.descripcion
  order by g.date asc
  limit 1000;
$$;

grant execute on function public.chat_product_daily(text, date, date) to anon, authenticated;
