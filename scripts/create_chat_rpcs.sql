-- RPC functions exposed to the AI chat agent. All read-only, top-N capped,
-- and security-definer so the anon role can call them through PostgREST
-- without needing extra RLS policies.

-- 1) search_products: full-text ILIKE across the two line-level tables.
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
language sql security definer as $$
    with picadeli as (
        select 'picadeli'::text as source,
               descripcion_raw,
               sum(uds)::numeric as total_uds,
               sum(importe)::numeric as total_revenue,
               count(*)::bigint as line_count,
               min(date) as first_sold,
               max(date) as last_sold
        from public.picadeli_sales
        where descripcion ilike '%' || upper(trim(q)) || '%'
        group by descripcion_raw
    ),
    can_e as (
        select 'can_escarrer'::text as source,
               descripcion_raw,
               sum(uds)::numeric as total_uds,
               sum(importe)::numeric as total_revenue,
               count(*)::bigint as line_count,
               min(date) as first_sold,
               max(date) as last_sold
        from public.can_escarrer_sales
        where descripcion ilike '%' || upper(trim(q)) || '%'
        group by descripcion_raw
    )
    select * from picadeli
    union all
    select * from can_e
    order by total_uds desc nulls last
    limit 50;
$$;

-- 2) transactions_by_bu: monthly Pax/Tickets/Orders for one or more BUs
--    in a given year.
create or replace function public.chat_transactions_by_bu(year_arg int, bu_names text[] default null)
returns table (
    bu_name text,
    month_num int,
    total_transactions bigint,
    total_revenue numeric
)
language sql security definer as $$
    select bu.name as bu_name,
           extract(month from sr.date)::int as month_num,
           sum(sr.transaction_count)::bigint as total_transactions,
           sum(sr.amount)::numeric as total_revenue
    from public.sales_records sr
    join public.business_units bu on bu.id = sr.business_unit_id
    where extract(year from sr.date) = year_arg
      and (bu_names is null or bu.name = any(bu_names))
    group by bu.name, extract(month from sr.date)
    order by bu.name, month_num;
$$;

-- 3) revenue_for_dates: daily revenue and units by BU for an explicit list of
--    dates. Used to answer "last 5 Tuesdays" style questions; the agent
--    resolves the date list first via reasoning and then calls this once.
create or replace function public.chat_revenue_for_dates(date_list date[])
returns table (
    "date" date,
    business_unit text,
    revenue numeric,
    volume numeric
)
language sql security definer as $$
    select s.date,
           s.business_unit,
           s.revenue::numeric,
           coalesce(nullif(replace(s."VOLUME"::text, ',', '.'), ''), '0')::numeric as volume
    from public.sales_daily_def s
    where s.date = any(date_list)
    order by s.date, s.business_unit;
$$;

-- 4) list_business_units: canonical names so the agent doesn't typo them.
create or replace function public.chat_list_business_units()
returns table (name text)
language sql security definer as $$
    select name from public.business_units order by name;
$$;

-- Grant execute to anon (the role used by VITE_SUPABASE_ANON_KEY).
grant execute on function public.chat_search_products(text)              to anon, authenticated;
grant execute on function public.chat_transactions_by_bu(int, text[])    to anon, authenticated;
grant execute on function public.chat_revenue_for_dates(date[])          to anon, authenticated;
grant execute on function public.chat_list_business_units()              to anon, authenticated;
