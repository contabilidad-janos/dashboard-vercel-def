// Import daily Pax / Tickets / Orders into public.sales_records for 2024
// from the legacy "Group sales 2024" CSV. Same shape as the 2025 importer
// but rows shifted (no month-row at the top) and the file only covers
// the back half of the year (29-jul → 31-dec).
//
// Source rows (after the daily Revenue and Internal Transfers blocks):
//   row 32 → Juntos house pax
//   row 33 → Juntos boutique tickets
//   row 36 → Picadeli tickets
//   row 37 → Juntos farm shop tickets
//   row 38 → Tasting place (labelled "tickets" in the sheet but it's pax)
//   row 39 → Distribution b2b orders
//   row 40 → Activities (Experiences)
//   row 41 → Juntos Products (Essential oils orders)
//
// Pre-condition: caller has cleared 2024-07-29 → 2024-12-31 from
// sales_records and disabled RLS so the anon key can INSERT.

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

const CSV_FILE = 'downloadbyjanos/1. Juntos Ibiza sales 2025 - Group sales 2024.csv';
const YEAR = 2024;
const BATCH = 500;
const DAY_ROW_IDX = 0;
const DATE_ROW_IDX = 1;

const ROW_TO_BU = {
    32: 'Juntos house',
    33: 'Juntos boutique',
    36: 'Picadeli',
    37: 'Juntos farm shop',
    38: 'Tasting place',
    39: 'Distribution b2b',
    40: 'Activities',
    41: 'Juntos Products',
};

const WEEKDAY_NAMES = {
    0: ['domingo'],
    1: ['lunes'],
    2: ['martes'],
    3: ['miercoles', 'miércoles'],
    4: ['jueves'],
    5: ['viernes'],
    6: ['sabado', 'sábado'],
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
    const { data: bus } = await supabase.from('business_units').select('id, name');
    const idByName = new Map(bus.map(b => [b.name, b.id]));
    for (const name of Object.values(ROW_TO_BU)) {
        if (!idByName.has(name)) {
            console.warn(`!! BU not found: "${name}". Its rows will be skipped.`);
        }
    }

    console.log(`Reading ${CSV_FILE}...`);
    const raw = fs.readFileSync(CSV_FILE, 'utf8');
    const rows = parse(raw, {
        relax_quotes: true,
        relax_column_count: true,
        skip_empty_lines: false,
    });

    const dateRow = rows[DATE_ROW_IDX] || [];
    const dayRow = rows[DAY_ROW_IDX] || [];
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
        const label = normLabel(dayRow[i]);
        if (!(WEEKDAY_NAMES[expectedDow] || []).includes(label)) { skippedWrongDay++; continue; }
        fechas.push({ col: i, date });
    }
    console.log(`Detected ${fechas.length} valid date columns (skipped ${skippedWrongDay} mismatches).`);
    console.log(`Range: ${fechas[0]?.date} → ${fechas[fechas.length - 1]?.date}`);

    const seen = new Map();
    const keyOf = (d, b) => `${d}__${b}`;
    let cellsRead = 0;

    for (const [rowIdxStr, buName] of Object.entries(ROW_TO_BU)) {
        const buId = idByName.get(buName);
        if (!buId) continue;
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
    console.log(`Cells scanned: ${cellsRead}. Built ${records.length} (date, BU) records.`);
    console.log('Sample:', records.slice(0, 4));

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
