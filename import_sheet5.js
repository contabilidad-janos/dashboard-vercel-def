import fs from 'fs';
import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || envConfig.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_FILE = 'downloadbyjanos/REPORTING PARA BASE DE DATOS - Sheet5 (13).csv';
const TABLE_NAME = 'sales_daily_def';

// The CSV is a Looker-style report with two pivot tables side by side on the
// same row. We use both halves:
//
//   LEFT side (cols 3, 7, 9):   Fecha · Uds. · BU
//     → one row per (Date × Serie × BU); aggregated to (Date, BU) for VOLUME.
//
//   RIGHT side (cols 11, 12, 13):  dia · BU · Total Día
//     → one row per (Date × BU); revenue passes through verbatim.
//
// Both halves share the same canonical BU names so we can join on (date, BU).

const parseUds = (s) => {
    if (!s) return 0;
    const clean = String(s).replace(/["\s,]/g, '');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
};

const parseRevenue = (s) => {
    if (!s || s === '-') return 0;
    const clean = String(s).replace(/["€\s,]/g, '');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
};

// Sheet uses M/D/YYYY (e.g. 1/2/2024 = Jan 2, 2024)
const formatMDYDate = (raw) => {
    if (!raw || !raw.includes('/')) return null;
    const [m, d, y] = raw.split('/');
    if (!m || !d || !y) return null;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

async function importCsv() {
    console.log('Starting CSV processing...');

    // (date, bu) → { revenue?, volume? }
    const merged = new Map();
    const keyOf = (date, bu) => `${date}__${bu}`;

    const parser = fs.createReadStream(CSV_FILE)
        .pipe(parse({
            delimiter: ',',
            from_line: 3,
            relax_quotes: true,
            relax_column_count: true,
        }));

    let leftSeen = 0;
    let rightSeen = 0;

    for await (const record of parser) {
        // LEFT half — accumulate Uds. by (Fecha, BU)
        const fechaL = (record[3] || '').trim();
        const udsL = (record[7] || '').trim();
        const buL = (record[9] || '').trim();
        if (fechaL && udsL && buL && buL.toUpperCase() !== 'BU') {
            const date = formatMDYDate(fechaL);
            if (date) {
                const uds = parseUds(udsL);
                if (uds > 0) {
                    const k = keyOf(date, buL);
                    const cur = merged.get(k) || {};
                    cur.volume = (cur.volume || 0) + uds;
                    merged.set(k, cur);
                    leftSeen++;
                }
            }
        }

        // RIGHT half — pick up the daily total revenue
        if (record.length >= 14) {
            const fechaR = (record[11] || '').trim();
            const buR = (record[12] || '').trim();
            const totR = (record[13] || '').trim();
            if (fechaR && buR && buR.toUpperCase() !== 'BU' && buR.toUpperCase() !== 'TOTAL') {
                const date = formatMDYDate(fechaR);
                if (date) {
                    const k = keyOf(date, buR);
                    const cur = merged.get(k) || {};
                    cur.revenue = parseRevenue(totR);
                    merged.set(k, cur);
                    rightSeen++;
                }
            }
        }
    }

    console.log(`Parsed ${leftSeen} LEFT line-items, ${rightSeen} RIGHT daily totals.`);
    console.log(`Merged into ${merged.size} unique (date, BU) cells.`);

    const records = [];
    for (const [k, v] of merged) {
        const [date, business_unit] = k.split('__');
        const row = { date, business_unit };
        if (v.revenue !== undefined) row.revenue = v.revenue;
        // VOLUME is case-sensitive in the schema; supabase-js passes the
        // object key through verbatim.
        if (v.volume !== undefined) row.VOLUME = Math.round(v.volume * 100) / 100;
        records.push(row);
    }

    console.log('Sample:', records.slice(0, 5));

    const BATCH_SIZE = 500;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        console.log(`Upserting batch ${i / BATCH_SIZE + 1} (${batch.length} records)...`);
        const { error } = await supabase
            .from(TABLE_NAME)
            .upsert(batch, { onConflict: 'date, business_unit' });
        if (error) {
            console.error(`Error in batch ${i / BATCH_SIZE + 1}:`, error.message);
        }
    }
    console.log('Finished uploading CSV.');
}

importCsv();
