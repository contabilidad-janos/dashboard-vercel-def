
-- Remove duplicate rows using ctid (internal system ID) since there is no 'id' column
-- This keeps one row per date+business_unit combination (the one with the lowest physical location/ctid)

DELETE FROM public.sales_daily_def
WHERE ctid NOT IN (
  SELECT min(ctid)
  FROM public.sales_daily_def
  GROUP BY date, business_unit
);
