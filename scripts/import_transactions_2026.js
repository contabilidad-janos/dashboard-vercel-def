#!/usr/bin/env node
// Populate sales_records.transaction_count for 2026 using three sources:
//
//  1. Juntos House — Revenue Reporting 2026 — DataBase (2).csv
//     → Juntos house "pax" from col 6 (Total pax, SALES block)
//
//  2. Juntos House — Revenue Reporting 2026 — juntos boutique.csv
//     → Juntos boutique tickets from col 4 (Nº TICKETS, SALES block)
//
//  3. ventas para reporting tickets.xlsx - Hoja1.csv
//     → Picadeli / Juntos farm shop / Distribution b2b / Juntos Products
//     Mapping follows the user's ARRAYFORMULA:
//        FVQ                       → skip
//        AVB                       → Juntos boutique (handled by sheet above)
//        starts with A             → Juntos house (handled by sheet above)
//        starts with C             → Picadeli
//        starts with FS            → Juntos farm shop
//        starts with FT, or FVE/FVD/FVM/FVT → Tasting place (we use winter
//                                              events sheet for pax instead)
//        starts with FV (any other) → Distribution b2b   (FVA, FVJ, FVS, FVR, …)
//        starts with JV            → Juntos Products
//
//  4. 2026_Winter_Events Performance Tracker - Lun-Vie.csv
//     → Tasting place pax from col "Total personas"
import fs from 'fs';
import https from 'https';
import { parse as csvParse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const PAT = process.env.SUPA_PAT;
const APPLY = process.argv.includes('--apply');

const BU_ID = {
    'Juntos house':       '93600eb9-486e-4258-b865-26f40c00de0e',
    'Tasting place':      '73d5d642-3e6b-48c4-a4d0-af340a8a3164',
    'Picadeli':           'bfe702c5-d04a-4254-9ef3-ce1ad55f10af',
    'Juntos farm shop':   'f9ac850e-5dd7-4d0f-a08c-27c613abf107',
    'Distribution b2b':   'b0cb51d9-1b5b-4823-bb91-866fed26a211',
    'Juntos boutique':    '993ac2a4-feb0-4f4f-8655-e0c1dd9eee0f',
    'Juntos Products':    'e9c52225-f76c-4ec3-85d4-fd7718d8dfef',
};

const parseDDMM = (d) => {
    const m = String(d || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
};
const parseMDDM = (d) => {
    const m = String(d || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
};
const intOnly = (s) => parseInt(String(s || '0').replace(/[^0-9-]/g, ''), 10) || 0;
const numEU = (s) => parseFloat(String(s || '0').replace(/[^0-9.-]/g, '')) || 0;

const buFromSerie = (serie) => {
    const s = (serie || '').trim().toUpperCase();
    if (!s || s === 'FVQ') return null;
    if (s === 'AVB') return null;            // covered by boutique sheet
    if (s.startsWith('A')) return null;      // Juntos house — covered by DataBase pax
    if (s.startsWith('C')) return 'Picadeli';
    if (s.startsWith('FS')) return 'Juntos farm shop';
    if (s.startsWith('FT') || ['FVE','FVD','FVM','FVT'].includes(s)) return null; // Tasting — use winter events pax
    if (s.startsWith('FV')) return 'Distribution b2b';
    if (s.startsWith('JV')) return 'Juntos Products';
    return null; // OTROS — skip
};

// ─── Aggregate per (date, BU) ───────────────────────────────────────────────
const byKey = new Map(); // key: `${date}__${BU}` → count
const add = (date, bu, count) => {
    if (!date || !bu || !count) return;
    if (date < '2026-01-01' || date > '2026-12-31') return;
    const k = `${date}__${bu}`;
    byKey.set(k, (byKey.get(k) || 0) + count);
};

// 1) Juntos house pax
{
    const raw = fs.readFileSync('downloadbyjanos/Juntos House  - Revenue Reporting 2026 - DataBase (5).csv', 'utf8');
    const rows = csvParse(raw, { from_line: 3, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });
    let n = 0;
    rows.forEach(r => {
        const date = parseDDMM(r[2]);          // col 2 = Date (SALES)
        const pax = intOnly(r[6]);             // col 6 = Total pax (SALES)
        if (date && pax > 0) { add(date, 'Juntos house', pax); n++; }
    });
    console.log(`Juntos house pax days: ${n}`);
}

// 2) Juntos boutique tickets
{
    const raw = fs.readFileSync('downloadbyjanos/Juntos House  - Revenue Reporting 2026 - juntos boutique (3).csv', 'utf8');
    const rows = csvParse(raw, { from_line: 3, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });
    let n = 0;
    rows.forEach(r => {
        const date = parseDDMM(r[0]);          // col 0 = DATE
        const tickets = intOnly(r[4]);         // col 4 = Nº TICKETS
        if (date && tickets > 0) { add(date, 'Juntos boutique', tickets); n++; }
    });
    console.log(`Juntos boutique tickets days: ${n}`);
}

// 3) tickets CSV — per-BU aggregation
{
    const raw = fs.readFileSync('downloadbyjanos/ventas para reporting tickets.xlsx - Hoja1.csv', 'utf8');
    const rows = csvParse(raw, { columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });
    const counters = {};
    const refunds = {};
    rows.forEach(r => {
        const date = parseMDDM(r.Fecha);
        const bu = buFromSerie(r.NUMSERIE);
        const tk = intOnly(r.TOTALTIQUETS);
        const base = numEU(r.BASEIMPONIBLE);
        if (!date || !bu || !tk) return;
        // Refunds / credit notes (negative base or negative ticket count) are NOT
        // orders/tickets — exclude so the count reflects real orders. This matters
        // most for Distribution b2b (number of orders/day), and removes the
        // month-end credit-note spikes (e.g. series FVR).
        if (base < 0 || tk < 0) { refunds[bu] = (refunds[bu] || 0) + tk; return; }
        add(date, bu, tk);
        counters[bu] = (counters[bu] || 0) + tk;
    });
    console.log('Tickets-CSV aggregates (positive orders/tickets, refunds excluded):');
    Object.entries(counters).forEach(([bu, n]) => console.log(`  ${bu}: ${n}`));
    console.log('Refund/credit tickets excluded:');
    Object.entries(refunds).forEach(([bu, n]) => console.log(`  ${bu}: ${n}`));
}

// 4) Tasting place pax — Winter Events tracker
{
    const raw = fs.readFileSync('downloadbyjanos/2026_Winter_Events Performance Tracker - Lun-Vie.csv', 'utf8');
    const rows = csvParse(raw, { columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });
    let n = 0;
    rows.forEach(r => {
        const date = parseDDMM(r.Fecha);
        const pax = intOnly(r['Total personas']);
        if (date && pax > 0) { add(date, 'Tasting place', pax); n++; }
    });
    console.log(`Tasting place pax days: ${n}`);
}

const records = [];
byKey.forEach((count, key) => {
    const [date, bu] = key.split('__');
    const bu_id = BU_ID[bu];
    if (!bu_id) return;
    records.push({ date, business_unit_id: bu_id, transaction_count: count });
});

console.log(`\nTotal (date, BU) cells: ${records.length}`);
console.log('Per-BU totals:');
const perBu = {};
records.forEach(r => {
    const name = Object.entries(BU_ID).find(([, id]) => id === r.business_unit_id)?.[0];
    perBu[name] = (perBu[name] || 0) + r.transaction_count;
});
Object.entries(perBu).sort((a, b) => b[1] - a[1]).forEach(([bu, n]) =>
    console.log(`  ${bu.padEnd(20)} ${n}`));

if (!APPLY) {
    console.log('\nDRY RUN — pass --apply to write to sales_records.');
    process.exit(0);
}

// ─── Upsert via supabase-js (anon RLS permits sales_records writes) ──────────
const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const BATCH = 500;
let upserted = 0, failed = 0;
for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH).map(r => ({
        date: r.date, business_unit_id: r.business_unit_id, transaction_count: r.transaction_count,
    }));
    const { error } = await supabase.from('sales_records').upsert(batch, { onConflict: 'date,business_unit_id' });
    if (error) { console.error(`batch ${i / BATCH + 1} error:`, error.message); failed += batch.length; }
    else upserted += batch.length;
}
console.log(`Upserted ${upserted} rows${failed ? `, ${failed} failed` : ''}.`);

// ─── Prune orphans ──────────────────────────────────────────────────────────
// The upsert is keyed on (date, business_unit_id), so a row whose SOURCE date
// changed (or that a later rule now excludes) is never overwritten — it is
// simply left behind, silently double-counting. Real cases found 2026-07-20:
//   · Tasting 2026-02-01 71 pax — tracker row re-dated to 2026-01-02 (M/D typo)
//   · Tasting 2026-06-13 37 pax — event re-dated to 2026-06-06 at source
//   · Products 2026-05-28  1 pax — a JVF refund, excluded once the
//     refund rule landed, but its old row survived
// The four sources are complete for 2026, so anything in the DB for these BUs
// that the sources no longer produce is an orphan and must go.
{
    const managed = Object.keys(BU_ID);
    const idToName = Object.fromEntries(Object.entries(BU_ID).map(([n, i]) => [i, n]));
    const expected = new Set(records.map(r => `${r.date}__${idToName[r.business_unit_id]}`));

    let existing = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from('sales_records')
            .select('id, date, transaction_count, business_unit_id')
            .gte('date', '2026-01-01').lte('date', '2026-12-31')
            .range(from, from + 999);
        if (error) { console.error('prune read failed:', error.message); existing = null; break; }
        if (!data || !data.length) break;
        existing = existing.concat(data);
        if (data.length < 1000) break;
    }

    if (existing) {
        const orphans = existing.filter(r => {
            const bu = idToName[r.business_unit_id];
            if (!bu || !managed.includes(bu)) return false;       // untouched BUs (e.g. Activities)
            if (!(Number(r.transaction_count) > 0)) return false; // zero rows are harmless
            return !expected.has(`${r.date}__${bu}`);
        });
        if (!orphans.length) console.log('Orphan check: none.');
        else {
            console.log(`Orphan rows (source no longer produces them): ${orphans.length}`);
            orphans.forEach(o => console.log(`  ${o.date}  ${idToName[o.business_unit_id]}  pax=${o.transaction_count}`));
            const { error } = await supabase.from('sales_records').delete().in('id', orphans.map(o => o.id));
            if (error) console.error('  prune delete failed:', error.message);
            else console.log(`  deleted ${orphans.length}.`);
        }
    }
}
