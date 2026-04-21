import fs from 'fs';
import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY
    || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
    || envConfig.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_FILE = 'downloadbyjanos/03. Inventario Juntos deli retail marzo 2026 - INV. marzo.csv';
const TABLE_NAME = 'picadeli_inventory';
const SNAPSHOT_DATE = '2026-03-31';
const BATCH_SIZE = 200;

// Prices/values come as "20.00€" (English decimal, not Spanish). Just strip the € and
// parse — do NOT treat the dot as a thousands separator here.
const parsePrice = (str) => {
    if (str == null) return 0;
    const clean = String(str).replace(/€/g, '').replace(/\u00A0/g, '').replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
};

const parseUnits = (str) => {
    if (str == null || str === '') return 0;
    const clean = String(str).trim().replace(',', '.');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
};

const normalize = (s) => {
    if (!s) return '';
    return String(s).trim().toUpperCase().replace(/\s+/g, ' ');
};

async function importCsv() {
    console.log(`Reading ${CSV_FILE}...`);
    const records = [];

    const parser = fs.createReadStream(CSV_FILE)
        .pipe(parse({
            columns: true,
            delimiter: ',',
            relax_quotes: true,
            relax_column_count: true,
            skip_empty_lines: true,
            trim: true,
            bom: true,
        }));

    let skippedNoArticulo = 0;
    const seen = new Set();
    let skippedDuplicate = 0;

    for await (const raw of parser) {
        const articuloRaw = raw['ARTICULO'] || raw['Articulo'] || raw['articulo'] || '';
        if (!articuloRaw.trim()) { skippedNoArticulo++; continue; }

        const articuloNorm = normalize(articuloRaw);
        if (seen.has(articuloNorm)) { skippedDuplicate++; continue; }
        seen.add(articuloNorm);

        const rec = {
            snapshot_date: SNAPSHOT_DATE,
            departamento: (raw['DEPARTAMENTO'] || '').trim() || null,
            proveedor: (raw['PROVEEDOR'] || '').trim() || null,
            articulo: articuloRaw.trim(),
            articulo_normalized: articuloNorm,
            precio_unidad: parsePrice(raw['PRECIO UNIDAD']),
            stock_units: parseUnits(raw['CONTEO INVENTARIO']),
            stock_value: parsePrice(raw['VALOR INVENTARIO']),
        };
        records.push(rec);
    }

    console.log(`Parsed ${records.length} rows. Skipped: ${skippedNoArticulo} empty, ${skippedDuplicate} duplicates.`);
    console.log('Sample:', records.slice(0, 3));

    let uploaded = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(records.length / BATCH_SIZE);
        process.stdout.write(`\rBatch ${batchNum}/${totalBatches} (${batch.length} rows)...`);

        const { error } = await supabase
            .from(TABLE_NAME)
            .upsert(batch, { onConflict: 'snapshot_date,articulo_normalized' });

        if (error) {
            console.error(`\nError in batch ${batchNum}:`, error.message);
            return;
        }
        uploaded += batch.length;
    }
    console.log(`\nUploaded ${uploaded} rows to ${TABLE_NAME} (snapshot ${SNAPSHOT_DATE}).`);
}

importCsv().catch(e => { console.error(e); process.exit(1); });
