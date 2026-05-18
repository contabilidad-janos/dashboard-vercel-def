#!/usr/bin/env node
import https from 'https';

const PAT = process.env.SUPA_PAT;
const PROJ = process.env.SUPA_PROJECT || 'agjvhvjhrmwkvszyjitl';
if (!PAT) { console.error('Missing SUPA_PAT env'); process.exit(1); }

const SQL = `
create or replace function public.chat_top_products_by_bu(
  bu_name text,
  start_date date default '2024-01-01',
  end_date date default '2030-12-31',
  limit_n int default 10
)
returns table (descripcion_raw text, total_uds numeric, total_revenue numeric, line_count bigint, source text)
language sql security definer as $$
  with src as (
    select descripcion_raw, uds::numeric as uds, importe::numeric as importe, date, 'picadeli'::text as source
    from public.picadeli_sales
    where (bu_name ilike '%picadeli%' or bu_name ilike '%juntos deli%')
      and date between start_date and end_date
    union all
    select descripcion_raw, uds::numeric as uds, importe::numeric as importe, date, lower(c.bu)::text as source
    from public.can_escarrer_sales c
    where (
      (bu_name ilike '%tasting%'      and c.bu = 'TASTING')
      or (bu_name ilike '%farm shop%' and c.bu = 'SHOP')
      or (bu_name ilike '%distribution%' and c.bu = 'DISTRIBUCION')
    )
    and c.date between start_date and end_date
  )
  select descripcion_raw,
         sum(uds) as total_uds,
         sum(importe) as total_revenue,
         count(*)::bigint as line_count,
         max(source) as source
  from src
  group by descripcion_raw
  order by sum(importe) desc nulls last
  limit greatest(coalesce(limit_n, 10), 1);
$$;

grant execute on function public.chat_top_products_by_bu(text, date, date, int) to anon, authenticated;
`;

const body = JSON.stringify({ query: SQL });
const req = https.request({
    method: 'POST',
    host: 'api.supabase.com',
    path: `/v1/projects/${PROJ}/database/query`,
    headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    },
    timeout: 60000,
}, (res) => {
    let chunks = '';
    res.on('data', d => { chunks += d; });
    res.on('end', () => {
        console.log(`HTTP ${res.statusCode}`);
        console.log(chunks.slice(0, 500));
    });
});
req.on('error', e => { console.error(e); process.exit(1); });
req.write(body);
req.end();
