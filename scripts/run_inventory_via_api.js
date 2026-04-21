// Import Picadeli inventory via Supabase Management API (bypasses RLS via postgres role).
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const TOKEN = 'sbp_49a82bffca5236e2c8adc6f5c6e58f70fd382b3e';
const PROJECT_REF = 'agjvhvjhrmwkvszyjitl';
const CSV_FILE = 'downloadbyjanos/03. Inventario Juntos deli retail marzo 2026 - INV. marzo.csv';
const SNAPSHOT_DATE = '2026-03-31';

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
const normalize = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
const sqlStr = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

const csv = fs.readFileSync(CSV_FILE);
const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, trim: true, relax_quotes: true });

const seen = new Set();
const records = [];
for (const r of rows) {
    const articulo = (r['ARTICULO'] || '').trim();
    if (!articulo) continue;
    const norm = normalize(articulo);
    if (seen.has(norm)) continue;
    seen.add(norm);
    records.push({
        snapshot_date: SNAPSHOT_DATE,
        departamento: (r['DEPARTAMENTO'] || '').trim() || null,
        proveedor: (r['PROVEEDOR'] || '').trim() || null,
        articulo,
        articulo_normalized: norm,
        precio_unidad: parsePrice(r['PRECIO UNIDAD']),
        stock_units: parseUnits(r['CONTEO INVENTARIO']),
        stock_value: parsePrice(r['VALOR INVENTARIO']),
    });
}

console.log(`Parsed ${records.length} unique records.`);

// Delete prior snapshot for this date (idempotent re-runs), then bulk insert.
const values = records.map(r =>
    `(${sqlStr(r.snapshot_date)}, ${sqlStr(r.departamento)}, ${sqlStr(r.proveedor)}, ${sqlStr(r.articulo)}, ${sqlStr(r.articulo_normalized)}, ${r.precio_unidad}, ${r.stock_units}, ${r.stock_value})`
).join(',\n');

const sql = `
delete from public.picadeli_inventory where snapshot_date = '${SNAPSHOT_DATE}';
insert into public.picadeli_inventory
    (snapshot_date, departamento, proveedor, articulo, articulo_normalized, precio_unidad, stock_units, stock_value)
values
${values};
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
});

const text = await res.text();
console.log('Status:', res.status);
console.log('Response:', text.slice(0, 500));
