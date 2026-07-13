-- ============================================================================
--  Unify chat_top_products_by_bu on group_article_sales for ALL BUs.
--  Before: house/boutique read group_article_sales, but deli/tasting/farm/
--  distribution read picadeli_sales / can_escarrer_sales — which are imported
--  separately and lag (so the chat said "item-level details not recorded for
--  this week"). group_article_sales has every BU through the latest ICG export,
--  so the chat is now complete and consistent for any period.
--  (The BestSellingProducts UI keeps using the richer per-BU tables.)
-- ============================================================================
create or replace function public.chat_top_products_by_bu(
  bu_name text,
  start_date date default '2024-01-01',
  end_date date default '2030-12-31',
  limit_n int default 10
)
returns table (descripcion_raw text, total_uds numeric, total_revenue numeric, line_count bigint, source text)
language sql security definer
set statement_timeout to '15000'
as $$
  with m as (
    select case
      when bu_name ilike '%house%'                                  then 'Juntos house'
      when bu_name ilike '%boutique%'                               then 'Juntos boutique'
      when bu_name ilike '%deli%' or bu_name ilike '%picadeli%'     then 'Picadeli'
      when bu_name ilike '%farm%'                                   then 'Juntos farm shop'
      when bu_name ilike '%tasting%'                                then 'Tasting place'
      when bu_name ilike '%distribu%' or bu_name ilike '%b2b%'      then 'Distribution b2b'
      when bu_name ilike '%product%'                                then 'Juntos Products'
      else bu_name
    end as bu
  )
  select max(nullif(g.descripcion_raw, '')) as descripcion_raw,
         round(sum(g.uds), 2)               as total_uds,
         round(sum(g.importe), 2)           as total_revenue,
         count(*)::bigint                   as line_count,
         'group_articles'::text             as source
  from public.group_article_sales g
  join m on g.bu = m.bu
  where g.descripcion <> ''
    and g.date between start_date and end_date
  group by g.descripcion
  order by sum(g.importe) desc nulls last
  limit greatest(coalesce(limit_n, 10), 1);
$$;

grant execute on function public.chat_top_products_by_bu(text, date, date, int) to anon, authenticated;
