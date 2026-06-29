#!/usr/bin/env node
// Override sales_daily_def for Juntos house using the "Juntos House -
// Revenue Reporting 2026 - DataBase" spreadsheet. Reads Total Revenues
// (VAT exc) from the SALES side (col index 14), skipping the BUDGET
// duplicate block.
//
// Range arguments via env vars: SINCE / UNTIL as YYYY-MM-DD.
// Defaults: 2026-05-19 → 2026-06-07.

import fs from 'fs';
import https from 'https';
import { parse as csvParse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const PAT = process.env.SUPA_PAT;
const SINCE = process.env.SINCE || '2026-05-19';
const UNTIL = process.env.UNTIL || '2026-06-14';

const CSV = process.env.CSV || 'downloadbyjanos/Juntos House  - Revenue Reporting 2026 - DataBase (1).csv';
const raw = fs.readFileSync(CSV, 'utf8');
const rows = csvParse(raw, { from_line: 3, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });

const parseDate = (d) => {
    const m = String(d || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
};
const parseNumEU = (s) => {
    const t = String(s || '0').replace(/[€\s]/g, '').replace(/\./g, '').replace(/,/g, '.');
    return parseFloat(t) || 0;
};

const updates = rows.map(r => ({
    iso: parseDate(r[2]),
    rev: parseNumEU(r[14]),
})).filter(r => r.iso && r.iso >= SINCE && r.iso <= UNTIL && r.rev > 0);

console.log(`${updates.length} JH days to override (${SINCE} → ${UNTIL}):`);
updates.forEach(u => console.log(`  ${u.iso} → €${u.rev.toFixed(0)}`));

if (PAT) {
    const sql = updates.map(u =>
        `insert into public.sales_daily_def (date, business_unit, revenue) values ('${u.iso}', 'Juntos house', ${u.rev}) ` +
        `on conflict (date, business_unit) do update set revenue = ${u.rev};`
    ).join('\n');
    const body = JSON.stringify({ query: sql });
    const req = https.request({
        method: 'POST', host: 'api.supabase.com',
        path: `/v1/projects/agjvhvjhrmwkvszyjitl/database/query`,
        headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => { let c = ''; res.on('data', d => c += d); res.on('end', () => { console.log(`HTTP ${res.statusCode}`); if (res.statusCode >= 400) console.log(c.slice(0, 300)); }); });
    req.on('error', console.error); req.write(body); req.end();
} else {
    // anon: absolute upsert of Juntos house revenue from the DataBase sheet
    const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
    const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    const rows = updates.map(u => ({ date: u.iso, business_unit: 'Juntos house', revenue: u.rev }));
    const { error } = await supabase.from('sales_daily_def').upsert(rows, { onConflict: 'date,business_unit' });
    if (error) { console.error('upsert error:', error.message); process.exit(1); }
    console.log(`\nDone (anon). Overrode ${rows.length} Juntos house days.`);
}
