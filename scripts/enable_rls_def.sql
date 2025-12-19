
-- Enable RLS on the definitive daily sales table
alter table public.sales_daily_def enable row level security;

-- Create policy to allow public read access (essential for the dashboard to view data)
create policy "Enable public read access"
on public.sales_daily_def
for select
to anon, authenticated
using (true);
