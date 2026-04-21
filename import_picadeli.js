import fs from 'fs';
import crypto from 'crypto';
import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || envConfig.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_FILE = 'downloadbyjanos/VENTAS PICADELI - VENTAS PICA.csv';
const TABLE_NAME = 'picadeli_sales';
const BATCH_SIZE = 500;

// ─── Parsers ──────────────────────────────────────────────────────────────────
const parseNumEu = (str) => {
    if (str == null) return 0;
    const clean = String(str)
        .replace(/€/g, '')
        .replace(/\u00A0/g, '')
        .replace(/\s/g, '')
        .replace(/\./g, '')   // strip thousands separator
        .replace(',', '.');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
};

const parseHour = (str) => {
    if (!str) return null;
    const p = String(str).split(':');
    const h = parseInt(p[0], 10);
    return Number.isFinite(h) ? h : null;
};

// Fecha comes in DD/MM/YYYY or M/D/YYYY. Cross-check with Month/Year columns
// from the same row to resolve the ambiguity unambiguously.
const parseDate = (dateStr, monthCol, yearCol) => {
    if (!dateStr) return null;
    const parts = String(dateStr).trim().split('/');
    if (parts.length !== 3) return null;
    const [a, b, c] = parts.map(p => parseInt(p, 10));
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;

    const csvMonth = parseInt(monthCol, 10);
    const csvYear = parseInt(yearCol, 10);

    // Try DD/MM/YYYY first; if it doesn't match csv Month/Year, try M/D/YYYY.
    const candidates = [
        { d: a, m: b, y: c },    // DD/MM/YYYY
        { d: b, m: a, y: c },    // M/D/YYYY
    ];
    for (const cand of candidates) {
        if (cand.m < 1 || cand.m > 12 || cand.d < 1 || cand.d > 31) continue;
        if (Number.isFinite(csvMonth) && cand.m !== csvMonth) continue;
        if (Number.isFinite(csvYear) && cand.y !== csvYear) continue;
        const pad = n => String(n).padStart(2, '0');
        return `${cand.y}-${pad(cand.m)}-${pad(cand.d)}`;
    }
    // Fallback: pick whichever candidate has a valid month
    for (const cand of candidates) {
        if (cand.m >= 1 && cand.m <= 12 && cand.d >= 1 && cand.d <= 31) {
            const pad = n => String(n).padStart(2, '0');
            return `${cand.y}-${pad(cand.m)}-${pad(cand.d)}`;
        }
    }
    return null;
};

const normalizeDesc = (s) => {
    if (!s) return '';
    return String(s).trim().toUpperCase().replace(/\s+/g, ' ');
};

const makeRowHash = (rec, rowIndex) => {
    const payload = [
        rec.date, rec.hour, rec.serie, rec.cliente,
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

    for await (const raw of parser) {
        rowIndex++;

        const fecha = raw['Fecha'] || raw['fecha'] || '';
        const descRaw = raw['Descripción'] || raw['Descripcion'] || raw['descripción'] || '';
        const importeStr = raw['Importe'] || '';

        // Skip EOF padding rows
        if (!fecha && !descRaw && !importeStr) { skippedEmpty++; continue; }

        // Skip voids (no product name)
        if (!descRaw || !descRaw.trim()) { skippedVoid++; continue; }

        const date = parseDate(fecha, raw['Month'], raw['Year']);
        if (!date) { skippedBadDate++; continue; }

        const rec = {
            date,
            hour: parseHour(raw['Hora']),
            serie: (raw['Serie'] || '').trim() || null,
            cliente: (raw['Cliente'] || '').trim() || null,
            descripcion: normalizeDesc(descRaw),
            descripcion_raw: String(descRaw).trim(),
            departamento: (raw['Departamento'] || '').trim() || null,
            seccion: (raw['Sección'] || raw['Seccion'] || '').trim() || null,
            familia: (raw['Família'] || raw['Familia'] || '').trim() || null,
            marca: (raw['Marca'] || '').trim() || null,
            marca_mapeada: (raw['MARCA MAPEADA'] || '').trim() || null,
            uds: parseNumEu(raw['Uds.'] || raw['Uds']),
            importe: parseNumEu(importeStr),
        };
        rec.row_hash = makeRowHash(rec, rowIndex);
        records.push(rec);
    }

    console.log(`Parsed ${records.length} valid rows.`);
    console.log(`Skipped: ${skippedEmpty} empty, ${skippedVoid} voids, ${skippedBadDate} bad dates.`);
    console.log('Sample:', records.slice(0, 3));

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
