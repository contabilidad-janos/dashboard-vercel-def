#!/usr/bin/env node
// Sheet5's source data has DUPLICATED rows for 2026-06-01..05 (every Sheet5-fed
// BU shows exactly 2x the ICG line-level truth for those days — found 2026-07-15,
// deli June was €132,973 vs ICG €111,402). Until the REPORTING sheet source is
// fixed, import_sheet5 re-introduces the doubling each week, so this script
// re-applies the correction after every import (same pattern as fvj_move.js).
//
// Idempotent: sets sales_daily_def.revenue = SUM(group_article_sales.importe)
// for the affected (date, BU) cells ONLY when the stored value is >1.7x the
// article truth. Once the sheet is fixed at source, this becomes a no-op.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const DATES = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'];
const BUS = ['Picadeli', 'Tasting place', 'Juntos farm shop', 'Distribution b2b'];

// article truth per (date, bu) — PAGINATED: supabase-js caps a select at 1000
// rows, and these 5 days exceed that; a truncated read here once produced
// partial "truth" sums that clobbered two correct cells.
const truth = {};
for (let from = 0; ; from += 1000) {
    const { data: page, error: aerr } = await sb
        .from('group_article_sales')
        .select('date, bu, importe')
        .in('bu', BUS)
        .gte('date', DATES[0])
        .lte('date', DATES[DATES.length - 1])
        .range(from, from + 999);
    if (aerr) { console.error('read articles:', aerr.message); process.exit(1); }
    for (const r of page || []) {
        const k = `${r.date}__${r.bu}`;
        truth[k] = (truth[k] || 0) + (Number(r.importe) || 0);
    }
    if (!page || page.length < 1000) break;
}

const { data: cur, error: derr } = await sb
    .from('sales_daily_def')
    .select('date, business_unit, revenue')
    .in('business_unit', BUS)
    .gte('date', DATES[0])
    .lte('date', DATES[DATES.length - 1]);
if (derr) { console.error('read sales_daily_def:', derr.message); process.exit(1); }

let fixed = 0;
for (const row of cur || []) {
    const k = `${row.date}__${row.business_unit}`;
    const t = Math.round((truth[k] || 0) * 100) / 100;
    const rev = Number(row.revenue) || 0;
    if (t > 0 && rev / t > 1.7) {
        const { error } = await sb.from('sales_daily_def')
            .upsert([{ date: row.date, business_unit: row.business_unit, revenue: t }], { onConflict: 'date,business_unit' });
        if (error) { console.error(row.date, row.business_unit, error.message); process.exit(1); }
        console.log(`${row.date} ${row.business_unit}: €${rev} → €${t} (was ${(rev / t).toFixed(2)}x)`);
        fixed++;
    }
}
console.log(fixed ? `Sheet5 Jun 1-5 dupes: ${fixed} cells corrected.` : 'Sheet5 Jun 1-5 dupes: nothing to fix (source clean or already corrected).');
