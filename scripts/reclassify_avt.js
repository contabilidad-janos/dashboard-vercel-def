#!/usr/bin/env node
/**
 * Reclassify AVT advance invoices: move each invoice's revenue from the
 * Sheet5 "asiento" date (when the deposit hit the books) to the real
 * service date (the reservation date listed in MAPPING.csv).
 *
 * Sources:
 *   DIARIO ... CSV  → one row per accounting entry. We use the 700%
 *     account ("VENTA F&B EVENTOS") for the net-of-VAT revenue and its
 *     FECHA as the source date. CC=ARC for every AVT we've seen, which
 *     the user mapped to "Juntos house" in the dashboard.
 *   MAPPING.csv → carries a comment column with "Nuestra Factura AVT/N
 *     a CLIENT" + a FECHA that is the *real* service date.
 *
 * Modes:
 *   --dry-run (default): print the plan as a table, change nothing
 *   --apply: run the UPDATEs against sales_daily_def
 *
 * Usage:
 *   node scripts/reclassify_avt.js                # dry-run
 *   SUPA_PAT=... node scripts/reclassify_avt.js --apply
 */
import fs from 'fs';
import https from 'https';
import { parse as csvParse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const DIARIO_PATH  = 'downloadbyjanos/DIARIO DE APUNTES CAN CIRES 2025 - DIARIO DE APUNTES CAN CIRES 2025.csv';
const MAPPING_PATH = 'downloadbyjanos/DIARIO DE APUNTES CAN CIRES 2025 - MAPPING.csv';
const TARGET_BU    = 'Juntos house';
const APPLY        = process.argv.includes('--apply');

// ─── helpers ────────────────────────────────────────────────────────────────

// Dates in the CSVs come in three styles (M/D/YYYY, MM/DD/YYYY, sometimes
// DD/MM/YYYY). The MAPPING uses MM/DD/YYYY consistently. The DIARIO mixes
// both. We parse with M/D/YYYY (US) since that matches all samples seen.
const parseUsDate = (s) => {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    const [, mm, dd, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
};

// CSV uses US number format: "3,181.82" = three-thousand-one-eighty-one-and-change.
// Strip €, spaces, and commas (thousand separator); keep "." as decimal.
const parseEuro = (s) => {
    if (s == null) return 0;
    const clean = String(s).replace(/[€\s]/g, '').replace(/,/g, '');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
};

const supaQuery = (q) => new Promise((resolve, reject) => {
    const PAT = process.env.SUPA_PAT;
    if (!PAT) return reject(new Error('Set SUPA_PAT to apply'));
    const body = JSON.stringify({ query: q });
    const req = https.request({
        method: 'POST',
        host: 'api.supabase.com',
        path: `/v1/projects/agjvhvjhrmwkvszyjitl/database/query`,
        headers: {
            'Authorization': `Bearer ${PAT}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
        timeout: 60000,
    }, (res) => {
        let chunks = '';
        res.on('data', d => { chunks += d; });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try { resolve(JSON.parse(chunks)); } catch { resolve(chunks); }
            } else {
                reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 300)}`));
            }
        });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
});

// ─── load DIARIO: aggregate AVT venta lines per invoice ─────────────────────
const diario = csvParse(fs.readFileSync(DIARIO_PATH, 'utf8'), {
    columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true,
});

const avtInvoices = new Map(); // num → { num, client, sourceDate, amount }
for (const r of diario) {
    if (String(r.SERIEDOCUMENTO || '').toUpperCase().trim() !== 'AVT') continue;
    if (!String(r.CUENTA || '').startsWith('700')) continue;
    // Some early rows ship the number with a trailing "€" glyph (NUMERODOCUMENTO
    // ends up like "2€", "3€"). Strip anything non-numeric.
    const num = String(r.NUMERODOCUMENTO || '').replace(/[^\d]/g, '');
    if (!num) continue;

    const date = parseUsDate(r.FECHA);
    const amount = parseEuro(r.HABER);
    const comment = String(r.COMENTARIO || '');
    const clientMatch = comment.match(/AVT\/\d+\s+a\s+(.+)$/i);
    const client = clientMatch ? clientMatch[1].trim() : '(desconocido)';

    if (avtInvoices.has(num)) {
        const cur = avtInvoices.get(num);
        cur.amount += amount;
    } else {
        avtInvoices.set(num, { num, client, sourceDate: date, amount });
    }
}

// ─── load MAPPING ──────────────────────────────────────────────────────────
// The CSV has a "super-header" on row 0 grouping sections ("MAPPING PARA
// REPORTING PNL", "RECLASIFICACION / PERIODICIDAD GASTOS"...). The real
// column names are on row 1. Skip the first line and use row 1 as header.
const mappingRaw = fs.readFileSync(MAPPING_PATH, 'utf8');
const mappingNoSuper = mappingRaw.slice(mappingRaw.indexOf('\n') + 1);
const mapping = csvParse(mappingNoSuper, {
    columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true,
});

// We need to find a column that contains "Nuestra Factura AVT/N" and another
// adjacent column that holds the corresponding FECHA. The relevant section
// in this sheet is "RECLASIFICACIÓN" + "FECHA". Both names duplicate across
// the file ("FECHA" appears in several sections) — we identify the right
// pair by walking each row, finding any cell that mentions an AVT, and
// reading the next non-empty column that looks like a date.
const targetByNum = new Map();

// Locate the column header named exactly "RECLASIFICACIÓN" (or close).
const headerKeys = Object.keys(mapping[0] || {});
const reclKey = headerKeys.find(k => /RECLASIFICACI[ÓO]N\b/i.test(k));
// FECHA column is the next one after RECLASIFICACIÓN typically.
const reclIdx = reclKey ? headerKeys.indexOf(reclKey) : -1;
const fechaKey = reclIdx >= 0 ? headerKeys[reclIdx + 1] : null;

if (!reclKey || !fechaKey) {
    console.error('Could not find RECLASIFICACIÓN/FECHA columns in MAPPING. Headers:', headerKeys.slice(0, 15));
    process.exit(1);
}

for (const r of mapping) {
    const recl = String(r[reclKey] || '');
    const m = recl.match(/Nuestra\s+Factura\s+AVT\/(\d+)/i);
    if (!m) continue;
    const num = m[1];
    const date = parseUsDate(r[fechaKey]);
    if (!date) continue;
    if (!targetByNum.has(num)) targetByNum.set(num, date);
}

// ─── merge → plan ───────────────────────────────────────────────────────────
const plan = [];
for (const inv of avtInvoices.values()) {
    const targetDate = targetByNum.get(inv.num) || null;
    plan.push({
        num: inv.num,
        client: inv.client,
        sourceDate: inv.sourceDate,
        targetDate,
        amount: Math.round(inv.amount * 100) / 100,
        skip: !targetDate || targetDate === inv.sourceDate,
    });
}
plan.sort((a, b) => Number(a.num) - Number(b.num));

// ─── print summary ──────────────────────────────────────────────────────────
const toMove = plan.filter(p => !p.skip);
const skipped = plan.filter(p => p.skip);

console.log(`\nTotal AVT invoices found: ${plan.length}`);
console.log(`To move: ${toMove.length}`);
console.log(`Already on target date or no mapping: ${skipped.length}`);
console.log(`Target BU in dashboard: ${TARGET_BU}\n`);

console.log('AVT | Cliente                       | Source date | Target date | Importe (sin IVA) | Status');
console.log('----|-------------------------------|-------------|-------------|-------------------|-------');
for (const p of plan) {
    const status = p.skip
        ? (p.targetDate ? 'same date' : 'no mapping')
        : 'MOVE';
    console.log(
        `${String(p.num).padStart(3)} | ${p.client.slice(0, 30).padEnd(30)} | ` +
        `${p.sourceDate || '?       '}  | ${p.targetDate || '?       '}  | ` +
        `€${String(p.amount.toFixed(2)).padStart(12)}      | ${status}`
    );
}

const totalToMove = toMove.reduce((s, p) => s + p.amount, 0);
console.log(`\nTotal € to reclassify: €${totalToMove.toFixed(2)} across ${toMove.length} invoices.`);

if (!APPLY) {
    console.log(`\n(dry-run — re-run with --apply to update sales_daily_def)`);
    process.exit(0);
}

// ─── apply ──────────────────────────────────────────────────────────────────
console.log(`\nApplying ${toMove.length} reclassifications to sales_daily_def...`);

// Aggregate per source/target date so each (date, BU) only gets one UPDATE.
const sourceDelta = new Map(); // date → totalAmount (to subtract)
const targetDelta = new Map(); // date → totalAmount (to add)
for (const p of toMove) {
    sourceDelta.set(p.sourceDate, (sourceDelta.get(p.sourceDate) || 0) + p.amount);
    targetDelta.set(p.targetDate, (targetDelta.get(p.targetDate) || 0) + p.amount);
}

if (process.env.SUPA_PAT) {
    // Management API path (raw SQL with relative deltas).
    const sqlParts = [];
    for (const [d, amt] of sourceDelta) {
        sqlParts.push(
            `update public.sales_daily_def set revenue = revenue - ${amt.toFixed(2)} ` +
            `where date='${d}' and business_unit='${TARGET_BU}';`
        );
    }
    for (const [d, amt] of targetDelta) {
        sqlParts.push(
            `insert into public.sales_daily_def (date, business_unit, revenue) ` +
            `values ('${d}', '${TARGET_BU}', ${amt.toFixed(2)}) ` +
            `on conflict (date, business_unit) do update set revenue = sales_daily_def.revenue + ${amt.toFixed(2)};`
        );
    }
    console.log(`\nGenerated ${sqlParts.length} statements (Management API).`);
    const result = await supaQuery(sqlParts.join('\n'));
    console.log('Done.', typeof result === 'string' ? result.slice(0, 200) : '');
} else {
    // anon path: read current house revenue, apply the net delta per date, upsert.
    // Net per date = current - (moved away) + (moved in). Faithful to the SQL above.
    const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
    const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    const dates = [...new Set([...sourceDelta.keys(), ...targetDelta.keys()])];
    const cur = {};
    for (let i = 0; i < dates.length; i += 200) {
        const { data, error } = await supabase.from('sales_daily_def')
            .select('date,revenue').eq('business_unit', TARGET_BU).in('date', dates.slice(i, i + 200));
        if (error) { console.error('read error:', error.message); process.exit(1); }
        for (const r of data) cur[r.date] = Number(r.revenue) || 0;
    }
    const ups = dates.map(d => ({
        date: d, business_unit: TARGET_BU,
        revenue: Math.round(((cur[d] || 0) - (sourceDelta.get(d) || 0) + (targetDelta.get(d) || 0)) * 100) / 100,
    }));
    const { error } = await supabase.from('sales_daily_def').upsert(ups, { onConflict: 'date,business_unit' });
    if (error) { console.error('upsert error:', error.message); process.exit(1); }
    console.log(`\nDone (anon). Net-updated ${ups.length} (date, ${TARGET_BU}) cells; €${totalToMove.toFixed(2)} reclassified.`);
}
