
-- Remove rows where the date is NULL.
-- These are "Total" summary rows from the original CSV that cause double-counting.

DELETE FROM public.sales_daily_def
WHERE date IS NULL;
