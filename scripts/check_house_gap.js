#!/usr/bin/env node
// Juntos house 2026 H1: where is pax (transaction_count) missing vs revenue?
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { parse as csvParse } from 'csv-parse/sync';

const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const HOUSE = '93600eb9-486e-4258-b865-26f40c00de0e';

// sales_records: pax
const { data: sr } = await supabase.from('sales_records')
    .select('date, transaction_count')
    .eq('business_unit_id', HOUSE)
    .gte('date', '2026-01-01').lte('date', '2026-06-22')
    .order('date');
const paxByDate = {};
for (const r of sr) paxByDate[r.date] = Number(r.transaction_count) || 0;

// revenue source: discover columns first
const probe = await supabase.from('sales_daily_def').select('*').limit(1);
const cols = probe.data?.[0] ? Object.keys(probe.data[0]) : [];
console.log('sales_daily_def columns:', cols.join(', '));

// sales_daily_def is keyed by business_unit NAME + date, with its own VOLUME column
const ddef = (await supabase.from('sales_daily_def').select('date, revenue, "VOLUME"')
    .eq('business_unit', 'Juntos house')
    .gte('date', '2026-01-01').lte('date', '2026-06-22').order('date')).data || [];
const revByDate = {}, volDdef = {};
for (const r of ddef) { revByDate[r.date] = Number(r.revenue) || 0; volDdef[r.date] = Number(r.VOLUME) || 0; }

const allDates = [...new Set([...Object.keys(paxByDate), ...Object.keys(revByDate)])].sort();
const revNoPax = allDates.filter(d => (revByDate[d] || 0) > 0 && !(paxByDate[d] > 0));

console.log(`\nJuntos house 2026 (Jan 1 – Jun 22):`);
console.log(`  sales_records days with pax:        ${Object.values(paxByDate).filter(v => v > 0).length}`);
console.log(`  sales_daily_def days with revenue:  ${Object.values(revByDate).filter(v => v > 0).length}`);
console.log(`  sales_daily_def days with VOLUME:   ${Object.values(volDdef).filter(v => v > 0).length}`);
console.log(`  revenue but NO sales_records pax:    ${revNoPax.length} days  <-- the gap`);
console.log('\n  First 15 dates with revenue but no pax (date / €rev / ddef.VOLUME):');
revNoPax.slice(0, 15).forEach(d => console.log(`    ${d}  €${Math.round(revByDate[d])}  vol=${volDdef[d]}`));

// 2025 same window for reference
const ddef25 = (await supabase.from('sales_daily_def').select('date, revenue, "VOLUME"')
    .eq('business_unit', 'Juntos house')
    .gte('date', '2025-01-01').lte('date', '2025-06-22')).data || [];
console.log(`\n  2025 H1 ref: sales_daily_def days w/ revenue=${ddef25.filter(r => Number(r.revenue) > 0).length}, days w/ VOLUME=${ddef25.filter(r => Number(r.VOLUME) > 0).length}`);

// Ground truth: how many pax-days does the DataBase CSV actually contain for H1 2026?
const parseDDMM = (d) => {
    const m = String(d || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
const intOnly = (s) => parseInt(String(s || '0').replace(/[^0-9-]/g, ''), 10) || 0;
try {
    const raw = fs.readFileSync('downloadbyjanos/Juntos House  - Revenue Reporting 2026 - DataBase (2).csv', 'utf8');
    const rows = csvParse(raw, { from_line: 3, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });
    const csvPax = rows.map(r => ({ date: parseDDMM(r[2]), pax: intOnly(r[6]) }))
        .filter(x => x.date && x.date >= '2026-01-01' && x.date <= '2026-06-22');
    const withPax = csvPax.filter(x => x.pax > 0);
    const zeroPax = csvPax.filter(x => x.pax === 0);
    console.log(`\n  DataBase(2).csv H1 2026: ${csvPax.length} dated rows, ${withPax.length} with pax>0, ${zeroPax.length} with pax=0/blank`);
} catch (e) { console.log('  (could not read DataBase CSV:', e.message, ')'); }
