#!/usr/bin/env node
// Generic per-BU override of sales_daily_def.revenue from a Google-Sheets
// export. Two known BUs:
//   - Juntos house  → "DataBase (N).csv", date col 2, VAT-exc col 14
//   - Juntos boutique → "juntos boutique.csv", date col 0, VAT-exc col 15
//
// Run:
//   SUPA_PAT=... node scripts/override_bu_from_csv.js \
//     --bu="Juntos house" --csv="downloadbyjanos/...DataBase (2).csv" \
//     --date-col=2 --rev-col=14 --since=2026-05-19 --until=2026-06-21
import fs from 'fs';
import https from 'https';
import { parse as csvParse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const PAT = process.env.SUPA_PAT;

const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const m = a.match(/^--([^=]+)=(.*)$/);
        return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
    })
);
const BU = args.bu;
const CSV = args.csv;
const DATE_COL = parseInt(args['date-col'], 10);
const REV_COL = parseInt(args['rev-col'], 10);
const SINCE = args.since;
const UNTIL = args.until;
if (!BU || !CSV || !Number.isFinite(DATE_COL) || !Number.isFinite(REV_COL) || !SINCE || !UNTIL) {
    console.error('Required: --bu --csv --date-col --rev-col --since --until');
    process.exit(1);
}

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
    iso: parseDate(r[DATE_COL]),
    rev: parseNumEU(r[REV_COL]),
})).filter(r => r.iso && r.iso >= SINCE && r.iso <= UNTIL && r.rev > 0);

console.log(`${updates.length} ${BU} days to override (${SINCE} → ${UNTIL}):`);
updates.forEach(u => console.log(`  ${u.iso} → €${u.rev.toFixed(0)}`));

if (!updates.length) { console.log('Nothing to update.'); process.exit(0); }

if (PAT) {
    const sql = updates.map(u =>
        `insert into public.sales_daily_def (date, business_unit, revenue) values ('${u.iso}', '${BU}', ${u.rev}) ` +
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
    // anon: absolute upsert of revenue from the POS sheet
    const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
    const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    const r = updates.map(u => ({ date: u.iso, business_unit: BU, revenue: u.rev }));
    const { error } = await supabase.from('sales_daily_def').upsert(r, { onConflict: 'date,business_unit' });
    if (error) { console.error('upsert error:', error.message); process.exit(1); }
    console.log(`\nDone (anon). Overrode ${r.length} ${BU} days.`);
}
