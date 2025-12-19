
-- 1. Rename columns to be snake_case and fix typos
ALTER TABLE public.sales_daily_def 
RENAME COLUMN "BUISNESS UNIT" TO business_unit;

ALTER TABLE public.sales_daily_def 
RENAME COLUMN "DATE" TO old_date;

ALTER TABLE public.sales_daily_def 
RENAME COLUMN "REVENUE" TO old_revenue;

-- 2. Create new properly typed columns
ALTER TABLE public.sales_daily_def 
ADD COLUMN date date;

ALTER TABLE public.sales_daily_def 
ADD COLUMN revenue numeric;

-- 3. Update new columns by parsing old text values
-- Parsing 'DD/MM/YYYY' to Date
UPDATE public.sales_daily_def
SET date = to_date(old_date, 'DD/MM/YYYY');

-- Parsing '1,234.56' to Numeric
UPDATE public.sales_daily_def
SET revenue = CAST(REPLACE(old_revenue, ',', '') AS numeric);

-- 4. Clean up old columns (Optional, but cleaner to drop them or just ignore)
-- keeping them temporarily just in case, but ideally we drop them. 
-- For now, let's keep the dashboard logic simple: use the new columns.

-- 5. Index for performance
CREATE INDEX idx_sales_daily_def_date ON public.sales_daily_def(date);
CREATE INDEX idx_sales_daily_def_bu ON public.sales_daily_def(business_unit);
