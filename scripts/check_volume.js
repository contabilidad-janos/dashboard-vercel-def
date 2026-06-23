#!/usr/bin/env node
// Read-only volume audit: sales_records.transaction_count by BU and year.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// BU id -> name
const { data: bus, error: buErr } = await supabase.from('business_units').select('id, name');
if (buErr) { console.error('business_units error:', buErr); process.exit(1); }
const buName = Object.fromEntries(bus.map(b => [b.id, b.name]));

// Paginated fetch of all sales_records (2024-2026)
let rows = [];
for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
        .from('sales_records')
        .select('date, business_unit_id, transaction_count, amount')
        .gte('date', '2024-01-01').lte('date', '2026-12-31')
        .order('date', { ascending: true })
        .range(from, from + 999);
    if (error) { console.error('sales_records error:', error); process.exit(1); }
    rows = rows.concat(data);
    if (data.length < 1000) break;
}
console.log(`Fetched ${rows.length} sales_records rows (2024-2026)\n`);

// Aggregate
const agg = {}; // key: bu||year
for (const r of rows) {
    const name = buName[r.business_unit_id] || r.business_unit_id;
    const yr = r.date.slice(0, 4);
    const k = `${name}||${yr}`;
    if (!agg[k]) agg[k] = { daysVol: 0, totalVol: 0, daysAmt: 0, totalAmt: 0 };
    const tc = Number(r.transaction_count);
    if (Number.isFinite(tc) && tc !== 0) { agg[k].daysVol++; agg[k].totalVol += tc; }
    const am = Number(r.amount);
    if (Number.isFinite(am) && am !== 0) { agg[k].daysAmt++; agg[k].totalAmt += am; }
}

const names = [...new Set(Object.keys(agg).map(k => k.split('||')[0]))].sort();
console.log('=== FULL YEAR ===');
console.log('BU'.padEnd(22), 'YEAR', 'daysVol', 'totalVol'.padStart(10), 'avgVol'.padStart(7), 'daysAmt', 'totalAmt'.padStart(12));
for (const name of names) {
    for (const yr of ['2024', '2025', '2026']) {
        const a = agg[`${name}||${yr}`];
        if (!a) continue;
        const avg = a.daysVol ? Math.round(a.totalVol / a.daysVol) : 0;
        console.log(
            name.padEnd(22), yr,
            String(a.daysVol).padStart(7),
            String(a.totalVol).padStart(10),
            String(avg).padStart(7),
            String(a.daysAmt).padStart(7),
            String(Math.round(a.totalAmt)).padStart(12),
        );
    }
    console.log('');
}

// ── SAME PERIOD: Jan 1 – Jun 22 of each year (apples-to-apples) ──
const h1 = {};
for (const r of rows) {
    const yr = r.date.slice(0, 4);
    const md = r.date.slice(5); // MM-DD
    if (md > '06-22') continue;
    const name = buName[r.business_unit_id] || r.business_unit_id;
    const k = `${name}||${yr}`;
    if (!h1[k]) h1[k] = { daysVol: 0, totalVol: 0 };
    const tc = Number(r.transaction_count);
    if (Number.isFinite(tc) && tc !== 0) { h1[k].daysVol++; h1[k].totalVol += tc; }
}
console.log('\n=== SAME PERIOD (Jan 1 – Jun 22) — apples to apples ===');
console.log('BU'.padEnd(22), 'YEAR', 'daysVol', 'totalVol'.padStart(10), 'avgVol'.padStart(7), 'YoY%vol'.padStart(8));
for (const name of names) {
    let prevTotal = null;
    for (const yr of ['2024', '2025', '2026']) {
        const a = h1[`${name}||${yr}`];
        if (!a) { prevTotal = null; continue; }
        const avg = a.daysVol ? Math.round(a.totalVol / a.daysVol) : 0;
        const yoy = prevTotal ? `${Math.round((a.totalVol / prevTotal - 1) * 100)}%` : '—';
        console.log(
            name.padEnd(22), yr,
            String(a.daysVol).padStart(7),
            String(a.totalVol).padStart(10),
            String(avg).padStart(7),
            String(yoy).padStart(8),
        );
        prevTotal = a.totalVol;
    }
    console.log('');
}
