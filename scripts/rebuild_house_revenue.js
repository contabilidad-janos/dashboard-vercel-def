#!/usr/bin/env node
// Rebuild Juntos house revenue in sales_daily_def from the source of truth,
// replacing the AVT periodification (which double-counted events already in the
// DataBase and accumulated week-over-week).
//
// Truth per date (2024-2026):  DataBase col14 (Total Revenues VAT-exc) if > 0
//                              else Sheet5 right-side "Total Día" if > 0
//                              else 0
// Idempotent: run it after import_sheet5 instead of reclassify_avt + house override.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const APPLY = process.argv.includes('--apply');
const DB_CSV = process.env.DB_CSV || 'downloadbyjanos/Juntos House  - Revenue Reporting 2026 - DataBase (5).csv';
const S5_CSV = process.env.S5_CSV || 'downloadbyjanos/REPORTING PARA BASE DE DATOS - Sheet5 (21).csv';

const ymd_dmy = (d) => { const m = String(d || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const ymd_mdy = (d) => { const m = String(d || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
const numEU = (s) => parseFloat(String(s || '0').replace(/[€\s]/g, '').replace(/\./g, '').replace(/,/g, '.')) || 0;
const numUS = (s) => parseFloat(String(s || '0').replace(/[€\s,]/g, '')) || 0;
const inRange = (d) => d && d >= '2024-01-01' && d <= '2026-12-31';

// DataBase house: date -> Total Revenues VAT-exc (col 14)
const db = parse(fs.readFileSync(DB_CSV, 'utf8'), { from_line: 3, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });
const dbVal = {};
for (const r of db) { const iso = ymd_dmy(r[2]); if (inRange(iso)) { const v = numEU(r[14]); if (v > 0) dbVal[iso] = v; } }

// Sheet5 house covers: right side date col 11 (M/D/Y), BU col 12, Total Día col 13
const s5 = parse(fs.readFileSync(S5_CSV, 'utf8'), { from_line: 3, relax_quotes: true, relax_column_count: true });
const s5Val = {};
for (const r of s5) { const iso = ymd_mdy((r[11] || '').trim()); if ((r[12] || '').trim() === 'Juntos house' && inRange(iso)) { const v = numUS(r[13]); if (v > 0) s5Val[iso] = (s5Val[iso] || 0) + v; } }

// current house rows
let cur = [];
for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from('sales_daily_def').select('date,revenue').eq('business_unit', 'Juntos house').gte('date', '2024-01-01').lte('date', '2026-12-31').range(f, f + 999);
    if (error) { console.error(error.message); process.exit(1); }
    cur = cur.concat(data); if (data.length < 1000) break;
}
const curMap = Object.fromEntries(cur.map(r => [r.date, Number(r.revenue) || 0]));

const allDates = [...new Set([...Object.keys(dbVal), ...Object.keys(s5Val), ...Object.keys(curMap)])].sort();
const correctOf = (d) => Math.round((dbVal[d] != null ? dbVal[d] : (s5Val[d] != null ? s5Val[d] : 0)) * 100) / 100;
const src = (d) => dbVal[d] != null ? 'DataBase' : (s5Val[d] != null ? 'Sheet5' : 'zero');

const ups = allDates.map(d => ({ date: d, business_unit: 'Juntos house', revenue: correctOf(d) }));
const changes = allDates.filter(d => (curMap[d] || 0) !== correctOf(d));
console.log(`House dates: ${allDates.length} | changing: ${changes.length}`);
console.log('Biggest corrections (date | from -> to | source):');
changes.map(d => ({ d, from: Math.round(curMap[d] || 0), to: Math.round(correctOf(d)), s: src(d) }))
    .sort((a, b) => Math.abs(b.from - b.to) - Math.abs(a.from - a.to)).slice(0, 18)
    .forEach(x => console.log(`  ${x.d} | €${x.from} -> €${x.to} | ${x.s}`));

const yearTotal = (y) => allDates.filter(d => d.startsWith(y)).reduce((s, d) => s + correctOf(d), 0);
console.log(`\nNew house yearly totals: 2024=€${Math.round(yearTotal('2024'))} 2025=€${Math.round(yearTotal('2025'))} 2026=€${Math.round(yearTotal('2026'))}`);

if (!APPLY) { console.log('\nDRY RUN — pass --apply to write.'); process.exit(0); }
for (let i = 0; i < ups.length; i += 500) {
    const { error } = await sb.from('sales_daily_def').upsert(ups.slice(i, i + 500), { onConflict: 'date,business_unit' });
    if (error) { console.error(error.message); process.exit(1); }
}
console.log(`\nApplied. ${ups.length} Juntos house cells rebuilt from source of truth.`);
