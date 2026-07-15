-- ============================================================================
--  Data fixes from the 2026-07-15 DB quality audit (Janos's decisions):
--  1) FVQ = intra-group re-invoiced services (HQ) — NOT Juntos Products. No new
--     BU for now → OTROS (excluded from dashboard, chat and Product Intelligence).
--  2) AVT / FVD = event advance-payment invoices booked at invoice date; they
--     distort house/tasting month-level article totals (±€30-60k/month). House
--     revenue truth remains the DataBase file (sales_daily_def) → OTROS.
--  3) FCF ("TASTING CATERING" ±€1,020 invoice+refund pair) → Tasting place.
--  4) Backfill sales_daily_def."VOLUME" (text) for 2026 Juntos house / boutique
--     days with revenue but null units — the feed stopped when import_sheet5
--     started skipping those BUs; source = article table daily unit sums.
--     (import_sheet5.js is being fixed to write volume-only rows for them.)
--  Run AFTER any re-import of group_article_sales too (importer mapping updated
--  in scripts/import_group_articles.js so this stays durable).
-- ============================================================================

update public.group_article_sales set bu = 'OTROS'
where numserie in ('FVQ', 'AVT', 'FVD') and bu <> 'OTROS';

update public.group_article_sales set bu = 'Tasting place'
where numserie = 'FCF' and bu <> 'Tasting place';

update public.sales_daily_def s
set "VOLUME" = g.uds::text
from (
  select date, bu, round(sum(uds)::numeric, 2) as uds
  from public.group_article_sales
  where bu in ('Juntos house', 'Juntos boutique') and date >= '2026-01-01'
  group by date, bu
) g
where s.date = g.date and s.business_unit = g.bu
  and s.revenue > 0
  and s."VOLUME" is null;

select public.pi_refresh();
