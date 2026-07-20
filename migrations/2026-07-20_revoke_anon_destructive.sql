-- ============================================================================
--  URGENT mitigation (2026-07-20): the public anon key — which ships inside the
--  browser bundle of a publicly-reachable dashboard — held DELETE and TRUNCATE
--  on every data table, and sales_daily_def had RLS disabled entirely. Verified
--  live: DELETE and PATCH on sales_daily_def both returned HTTP 200 with the
--  anon key. Anyone with the dashboard URL could wipe the revenue history.
--
--  This revokes only the DESTRUCTIVE privileges. It deliberately does NOT touch
--  SELECT/INSERT/UPDATE, so the weekly import scripts (which all upsert with the
--  anon key until a service-role key is provisioned) and the dashboard keep
--  working unchanged. Full lockdown — approval-gated SELECT, service-role-only
--  writes, revoking EXECUTE on the chat RPCs — lands with the Google-auth work.
--
--  EXCEPTION: sales_records keeps DELETE, because
--  scripts/import_transactions_2026.js prunes orphan pax rows with the anon key.
--  It loses TRUNCATE. That last hole closes when the importer moves to the
--  service-role key.
--
--  Reversal if anything unexpected breaks:
--     grant delete on public.<table> to anon;
-- ============================================================================

revoke truncate on
    public.sales_daily_def,
    public.sales_records,
    public.business_units,
    public.budget_targets,
    public.group_article_sales,
    public.can_escarrer_sales,
    public.picadeli_sales,
    public.picadeli_inventory
from anon;

revoke delete on
    public.sales_daily_def,
    public.business_units,
    public.budget_targets,
    public.group_article_sales,
    public.can_escarrer_sales,
    public.picadeli_sales,
    public.picadeli_inventory
from anon;

-- sales_daily_def had RLS switched OFF (scripts/enable_rls_def.sql never took
-- effect), so its existing "Enable public read access" policy was inert. Turn
-- RLS on and re-declare today's effective behaviour explicitly, so the later
-- lockdown is a policy edit rather than a behaviour change.
alter table public.sales_daily_def enable row level security;

drop policy if exists "Enable public read access" on public.sales_daily_def;
drop policy if exists sdd_read on public.sales_daily_def;
drop policy if exists sdd_write on public.sales_daily_def;

create policy sdd_read  on public.sales_daily_def for select using (true);
create policy sdd_write on public.sales_daily_def for insert with check (true);
create policy sdd_update on public.sales_daily_def for update using (true) with check (true);
