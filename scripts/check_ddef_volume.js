#!/usr/bin/env node
// Audit sales_daily_def.VOLUME for Juntos house: monthly sums, duplicate rows,
// June 2026 detail, and comparison vs sales_records.transaction_count.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const HOUSE_ID = '93600eb9-486e-4258-b865-26f40c00de0e';

const num = (v) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    // text VOLUME may use comma thousands / decimal
    let s = String(v).trim().replace(/\s/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');      // 1,234.5
    else if (s.includes(',')) s = s.replace(',', '.');                    // 1234,5
    return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
};

async function pageAll(builder) {
    let all = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await builder().range(from, from + 999);
        if (error) { console.error(error); process.exit(1); }
        all = all.concat(data);
        if (data.length < 1000) break;
    }
    return all;
}

// ── sales_daily_def for Juntos house ──
const ddef = await pageAll(() => supabase
    .from('sales_daily_def')
    .select('date, revenue, business_unit, "VOLUME"')
    .eq('business_unit', 'Juntos house')
    .gte('date', '2025-01-01').lte('date', '2026-12-31')
    .order('date'));

const monthly = {}; // ym -> {volSum, rows, dates:Set, revSum}
for (const r of ddef) {
    const ym = r.date.slice(0, 7);
    if (!monthly[ym]) monthly[ym] = { volSum: 0, rows: 0, dates: new Set(), revSum: 0 };
    const m = monthly[ym];
    m.volSum += num(r.VOLUME);
    m.revSum += num(r.revenue);
    m.rows++;
    m.dates.add(r.date);
}

console.log('=== sales_daily_def.VOLUME — Juntos house, monthly ===');
console.log('month    volSum   rows  distinctDates  DUP?   revSum');
for (const ym of Object.keys(monthly).sort()) {
    const m = monthly[ym];
    const dup = m.rows > m.dates.size ? `DUP x${(m.rows / m.dates.size).toFixed(2)}` : 'ok';
    console.log(
        ym,
        String(Math.round(m.volSum)).padStart(8),
        String(m.rows).padStart(5),
        String(m.dates.size).padStart(13),
        dup.padStart(8),
        String(Math.round(m.revSum)).padStart(10),
    );
}

// ── June 2026 row-level detail ──
console.log('\n=== June 2026 rows (date | VOLUME | revenue) — looking for repeats / wrong scale ===');
const jun = ddef.filter(r => r.date >= '2026-06-01' && r.date <= '2026-06-30');
const seen = {};
for (const r of jun) { seen[r.date] = (seen[r.date] || 0) + 1; }
jun.forEach(r => console.log(`  ${r.date}  vol=${String(r.VOLUME).padStart(8)}  rev=${String(Math.round(num(r.revenue))).padStart(7)}${seen[r.date] > 1 ? '   <-- DUP date (' + seen[r.date] + 'x)' : ''}`));
console.log(`June 2026: ${jun.length} rows, ${new Set(jun.map(r => r.date)).size} distinct dates, VOLUME sum = ${Math.round(jun.reduce((s, r) => s + num(r.VOLUME), 0))}`);

// ── compare vs sales_records.transaction_count for house 2026 ──
const sr = await pageAll(() => supabase
    .from('sales_records')
    .select('date, transaction_count')
    .eq('business_unit_id', HOUSE_ID)
    .gte('date', '2026-01-01').lte('date', '2026-12-31')
    .order('date'));
const srMonthly = {};
for (const r of sr) {
    const ym = r.date.slice(0, 7);
    srMonthly[ym] = (srMonthly[ym] || 0) + (Number(r.transaction_count) || 0);
}
console.log('\n=== Juntos house 2026: sales_daily_def.VOLUME  vs  sales_records.transaction_count ===');
console.log('month     ddef.VOLUME   sr.transaction_count');
for (const ym of Object.keys(monthly).filter(k => k.startsWith('2026')).sort()) {
    console.log(ym, String(Math.round(monthly[ym].volSum)).padStart(11), String(srMonthly[ym] || 0).padStart(22));
}
