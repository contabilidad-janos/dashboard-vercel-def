import fs from 'fs';
import crypto from 'crypto';
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

const CSV_FILE = 'downloadbyjanos/VENTAS CAN ESCARRER - VENTAS F 2024.csv';
const TABLE_NAME = 'can_escarrer_sales';
const BATCH_SIZE = 500;

const ALLOWED_BUS = new Set(['DISTRIBUCION', 'SHOP', 'TASTING', 'SERVICES']);

// ─── Parsers ──────────────────────────────────────────────────────────────────
const parseNumEu = (str) => {
    if (str == null) return 0;
    const clean = String(str)
        .replace(/€/g, '')
        .replace(/ /g, '')
        .replace(/\s/g, '')
        .replace(/\./g, '')   // strip thousands separator
        .replace(',', '.');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
};

// Fecha in this CSV is strictly DD/MM/YYYY. We still cross-check with the
// "mes" / "año" columns when present to catch bad rows.
const parseDate = (dateStr, monthCol, yearCol) => {
    if (!dateStr) return null;
    const parts = String(dateStr).trim().split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(p => parseInt(p, 10));
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (y < 2020 || y > 2100) return null;

    const csvMonth = parseInt(monthCol, 10);
    const csvYear = parseInt(yearCol, 10);
    if (Number.isFinite(csvMonth) && csvMonth !== m) return null;
    if (Number.isFinite(csvYear) && csvYear !== y) return null;

    const pad = n => String(n).padStart(2, '0');
    return `${y}-${pad(m)}-${pad(d)}`;
};

// Normalise product descriptions for grouping:
//   1. Strip accents (MATÉRIA → MATERIA) so accented variants collide
//   2. Uppercase
//   3. Unwrap parenthesised unit tags with an optional slash:
//      "(KG)", "(/KG)", "( M3 )" → "KG", "KG", "M3".
//      This lets "MEZCLUM KG" and "MEZCLUM (/KG)" group together.
//   4. Collapse whitespace + trim.
// `descripcion_raw` keeps the original string for display.
const normalizeDesc = (s) => {
    if (!s) return '';
    return String(s)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/\(\s*\/?\s*([A-Z0-9]+)\s*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeBu = (s) => {
    if (!s) return null;
    const up = String(s).trim().toUpperCase();
    if (up === '#N/A' || up === '') return null;
    return up;
};

const normalizeOrigen = (s) => {
    if (!s) return null;
    const up = String(s).trim().toUpperCase();
    if (up === '#N/A' || up === '') return null;
    return up;
};

const makeRowHash = (rec, rowIndex) => {
    const payload = [
        rec.date, rec.bu, rec.serie, rec.cliente,
        rec.descripcion, rec.uds, rec.importe, rowIndex
    ].join('|');
    return crypto.createHash('sha1').update(payload).digest('hex');
};

// ─── Main ─────────────────────────────────────────────────────────────────────
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

    let rowIndex = 0;
    let skippedEmpty = 0;
    let skippedVoid = 0;
    let skippedBadDate = 0;
    let skippedBadBu = 0;
    const buCounts = {};

    for await (const raw of parser) {
        rowIndex++;

        const fecha = raw['Fecha'] || raw['fecha'] || '';
        const descRaw = raw['Descripción'] || raw['Descripcion'] || raw['descripción'] || '';
        const importeStr = raw['Importe'] || '';

        // Skip EOF padding rows
        if (!fecha && !descRaw && !importeStr) { skippedEmpty++; continue; }

        // Skip voids (no product name)
        if (!descRaw || !descRaw.trim()) { skippedVoid++; continue; }

        const date = parseDate(fecha, raw['mes'], raw['año']);
        if (!date) { skippedBadDate++; continue; }

        const bu = normalizeBu(raw['bu']);
        if (!bu || !ALLOWED_BUS.has(bu)) { skippedBadBu++; continue; }

        const rec = {
            date,
            bu,
            serie: (raw['Serie'] || '').trim() || null,
            cliente: (raw['Cliente'] || '').trim() || null,
            tipo_cliente: (raw['Tipo cliente'] || '').trim() || null,
            origen: normalizeOrigen(raw['ORIGEN']),
            descripcion: normalizeDesc(descRaw),
            descripcion_raw: String(descRaw).trim(),
            departamento: (raw['Departamento'] || '').trim() || null,
            seccion: (raw['Sección'] || raw['Seccion'] || '').trim() || null,
            familia: (raw['Família'] || raw['Familia'] || '').trim() || null,
            marca: (raw['Marca'] || '').trim() || null,
            budget: (raw['Budget'] || '').trim() || null,
            uds: parseNumEu(raw['Uds.'] || raw['Uds']),
            importe: parseNumEu(importeStr),
            precio_unitario: parseNumEu(raw['precio unitario']),
        };
        rec.row_hash = makeRowHash(rec, rowIndex);
        records.push(rec);
        buCounts[bu] = (buCounts[bu] || 0) + 1;
    }

    console.log(`Parsed ${records.length} valid rows.`);
    console.log(`Skipped: ${skippedEmpty} empty, ${skippedVoid} voids, ${skippedBadDate} bad dates, ${skippedBadBu} unknown BU.`);
    console.log('BU distribution:', buCounts);
    console.log('Sample:', records.slice(0, 2));

    let uploaded = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(records.length / BATCH_SIZE);
        process.stdout.write(`\rBatch ${batchNum}/${totalBatches} (${batch.length} rows)...`);

        const { error } = await supabase
            .from(TABLE_NAME)
            .upsert(batch, { onConflict: 'row_hash' });

        if (error) {
            console.error(`\nError in batch ${batchNum}:`, error.message);
            return;
        }
        uploaded += batch.length;
    }
    console.log(`\nUploaded ${uploaded} rows to ${TABLE_NAME}.`);
}

importCsv().catch(e => { console.error(e); process.exit(1); });
