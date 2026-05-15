// Import daily Pax / Tickets / Orders into public.sales_records for 2025
// from the legacy "Group sales formato antiguo" CSV.
//
// Source rows in the CSV (already pivoted by Looker):
//   row 20 → Juntos house pax
//   row 21 → Juntos boutique tickets
//   row 24 → Picadeli tickets
//   row 25 → Juntos farm shop tickets
//   row 26 → Tasting place pax
//   row 27 → Distribution b2b orders
//   row 28 → Activities (Experiences)
//   row 29 → Juntos Products (Essential oils & OMIE & Throat spray)
//
// The CSV row 2 carries the date columns as DD/MM. They are 2025 because
// 01/01 is annotated as "miércoles" (2025-01-01 was Wednesday).
//
// Pre-condition: caller has cleared 2025 rows from sales_records and
// temporarily disabled RLS so the anon key can INSERT.

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

const CSV_FILE = 'downloadbyjanos/REPORTING PARA BASE DE DATOS - Copy of Group sales formato antiguo.csv';
const YEAR = 2025;
const BATCH = 500;

const ROW_TO_BU = {
    20: 'Juntos house',
    21: 'Juntos boutique',
    24: 'Picadeli',
    25: 'Juntos farm shop',
    26: 'Tasting place',
    27: 'Distribution b2b',
    28: 'Activities',
    29: 'Juntos Products',
};

const parseCount = (s) => {
    if (s == null) return null;
    const clean = String(s).trim().replace(/,/g, '').replace(/[€\s]/g, '');
    if (clean === '' || clean === '-') return null;
    const n = parseFloat(clean);
    return Number.isFinite(n) ? Math.round(n) : null;
};

async function main() {
    console.log('Loading business_units mapping...');
    const { data: bus, error: buErr } = await supabase
        .from('business_units').select('id, name');
    if (buErr) throw buErr;

    const idByName = new Map(bus.map(b => [b.name, b.id]));
    for (const name of Object.values(ROW_TO_BU)) {
        if (!idByName.has(name)) {
            console.warn(`!! BU not found in business_units: "${name}". Rows will be skipped.`);
        }
    }

    console.log(`Reading ${CSV_FILE}...`);
    const raw = fs.readFileSync(CSV_FILE, 'utf8');
    const rows = parse(raw, {
        relax_quotes: true,
        relax_column_count: true,
        skip_empty_lines: false,
    });

    // Row 2 is the date row (DD/MM). Row 1 is the weekday label. We use
    // row 1 to discriminate three traps the sheet contains:
    //   1. Repeat columns for the *next* year's same-DD/MM (weekday differs)
    //   2. Monthly-total columns dressed up as DD/MM but with the weekday
    //      cell filled in with month names (ENERO, FEBRERO, …)
    //   3. Garbage / blank weekdays
    // We accept a column only when the weekday in row 1 matches the
    // calendar weekday for `${YEAR}-${MM}-${DD}`.
    const dateRow = rows[2] || [];
    const dayRow = rows[1] || [];
    const WEEKDAY_NAMES = {
        0: ['domingo'],
        1: ['lunes'],
        2: ['martes'],
        3: ['miercoles', 'miércoles'],
        4: ['jueves'],
        5: ['viernes'],
        6: ['sabado', 'sábado'],
    };
    const normLabel = (s) => String(s || '').toLowerCase().trim();
    const fechas = [];
    let skippedWrongDay = 0;
    for (let i = 0; i < dateRow.length; i++) {
        const v = String(dateRow[i] || '').trim();
        const m = v.match(/^(\d{1,2})\/(\d{1,2})$/);
        if (!m) continue;
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        const date = `${YEAR}-${mm}-${dd}`;
        const expectedDow = new Date(`${date}T00:00:00Z`).getUTCDay();
        const expectedNames = WEEKDAY_NAMES[expectedDow] || [];
        const label = normLabel(dayRow[i]);
        if (!expectedNames.includes(label)) { skippedWrongDay++; continue; }
        fechas.push({ col: i, date });
    }
    console.log(`Detected ${fechas.length} valid date columns (skipped ${skippedWrongDay} mismatched/monthly-totals).`);
    console.log(`Range: ${fechas[0]?.date} → ${fechas[fechas.length - 1]?.date}`);

    // Build (date, BU) → transaction_count records.
    // If a single date appears multiple times in the CSV (the sheet has
    // a few duplicate columns for comparison sections), the LAST value
    // wins by walking left-to-right.
    const seen = new Map();
    const keyOf = (d, b) => `${d}__${b}`;
    let skippedNoBu = 0;
    let cellsRead = 0;

    for (const [rowIdxStr, buName] of Object.entries(ROW_TO_BU)) {
        const buId = idByName.get(buName);
        if (!buId) { skippedNoBu += fechas.length; continue; }
        const rowIdx = parseInt(rowIdxStr, 10);
        const row = rows[rowIdx] || [];
        for (const { col, date } of fechas) {
            const n = parseCount(row[col]);
            cellsRead++;
            if (n == null) continue;
            seen.set(keyOf(date, buId), {
                date,
                business_unit_id: buId,
                transaction_count: n,
            });
        }
    }

    const records = [...seen.values()];
    console.log(`Cells scanned: ${cellsRead}, missing-BU skipped: ${skippedNoBu}`);
    console.log(`Built ${records.length} unique (date, BU) records.`);
    console.log('Sample:', records.slice(0, 4));

    // Bulk upsert
    let uploaded = 0;
    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const batchNum = Math.floor(i / BATCH) + 1;
        const totalBatches = Math.ceil(records.length / BATCH);
        process.stdout.write(`\rBatch ${batchNum}/${totalBatches} (${batch.length} rows)...`);
        const { error } = await supabase
            .from('sales_records')
            .upsert(batch, { onConflict: 'date, business_unit_id' });
        if (error) {
            console.error(`\nError in batch ${batchNum}:`, error.message);
            process.exit(1);
        }
        uploaded += batch.length;
    }
    console.log(`\nUploaded ${uploaded} rows to sales_records.`);
}

main().catch(e => { console.error(e); process.exit(1); });
