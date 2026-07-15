-- ============================================================================
--  chat_revenue_for_dates v2: rename ambiguous "volume" → units_sold and add a
--  real pax column from sales_records. The chat was presenting VOLUME (product
--  units, ~4-5× covers) as "pax"/"tickets" (e.g. Christmas day "809.5 pax" —
--  that's units sold; real covers live in sales_records.transaction_count).
--  Return type changes ⇒ DROP first (CREATE OR REPLACE can't alter columns).
-- ============================================================================
drop function if exists public.chat_revenue_for_dates(text);

create or replace function public.chat_revenue_for_dates(date_list_csv text)
returns table (
    date date,
    business_unit text,
    revenue numeric,
    units_sold numeric,
    pax numeric
)
language sql security definer
set statement_timeout to '15000'
as $$
  select s.date,
         s.business_unit,
         s.revenue::numeric,
         coalesce(nullif(replace(s."VOLUME"::text, ',', '.'), ''), '0')::numeric as units_sold,
         coalesce(p.pax, 0)::numeric as pax
  from public.sales_daily_def s
  left join (
      select sr.date as d, bu.name as bu_name, sum(sr.transaction_count)::numeric as pax
      from public.sales_records sr
      join public.business_units bu on bu.id = sr.business_unit_id
      group by sr.date, bu.name
  ) p on p.d = s.date and p.bu_name = s.business_unit
  where s.date = any(string_to_array(date_list_csv, ',')::date[])
  order by s.date, s.business_unit;
$$;

grant execute on function public.chat_revenue_for_dates(text) to anon, authenticated;
