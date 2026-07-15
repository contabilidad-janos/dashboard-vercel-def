#!/usr/bin/env node
// Import the ICG "VENTASARTICULOS" article-level export (group-wide, net/sin IVA)
// into public.group_article_sales. Idempotent via a deterministic row_hash over
// the query's GROUP BY key, so re-exporting the full history and re-importing is
// safe (no duplicates). Writes with the anon key (RLS policies added in
// migrations/2026-07-13_group_article_sales.sql).
//
//   node scripts/import_group_articles.js            # dry run (parse + summarise)
//   node scripts/import_group_articles.js --apply    # write to Supabase
//
// Optionally point at a specific export:
//   CSV="downloadbyjanos/VENTASARTICULOS (4).CSV" node scripts/import_group_articles.js --apply
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const APPLY = process.argv.includes('--apply');
const CSV_FILE = process.env.CSV || 'downloadbyjanos/VENTASARTICULOS (4).CSV';
const TABLE = 'group_article_sales';

// ── quote-aware ';' splitter (the file is ANSI/cp1252, ';'-delimited) ──────────
function splitLine(line) {
    const out = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
            if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
            else cur += ch;
        } else {
            if (ch === '"') inQ = true;
            else if (ch === ';') { out.push(cur); cur = ''; }
            else cur += ch;
        }
    }
    out.push(cur);
    return out;
}
const numEU = (s) => { if (s == null || s === '') return 0; const n = parseFloat(String(s).replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const parseFecha = (f, mes, anio) => {
    if (!f) return null;
    const p = String(f).trim().split(' ')[0].split('/');
    if (p.length !== 3) return null;
    const [a, b, c] = p.map(x => parseInt(x, 10));
    const mm = MONTHS[(String(mes).trim().split(' ').pop() || '').toLowerCase()] || null;
    const y = parseInt(anio, 10);
    const pad = n => String(n).padStart(2, '0');
    const ok = x => x.m >= 1 && x.m <= 12 && x.d >= 1 && x.d <= 31 && (!Number.isFinite(y) || x.y === y);
    const dm = { d: a, m: b, y: c };                 // D/M/YYYY (this file's convention)
    if (ok(dm) && (mm == null || dm.m === mm)) return `${dm.y}-${pad(dm.m)}-${pad(dm.d)}`;
    const md = { d: b, m: a, y: c };
    if (ok(md) && (mm == null || md.m === mm)) return `${md.y}-${pad(md.m)}-${pad(md.d)}`;
    return null;
};
const normalizeDesc = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');

// Full NUMSERIE → BU mapping (canonical; assigns EVERY serie, incl. house/boutique).
// Matches the user's ARRAYFORMULA used in import_transactions_2026.js, extended so
// house (A*) and boutique (AVB) are also attributed (they were skipped there only
// because volume came from other sheets).
const buFromSerie = (serie) => {
    const s = (serie || '').trim().toUpperCase();
    if (!s) return 'OTROS';
    // Excluded from operating BUs (audit 2026-07-15, Janos's calls):
    //  FVQ = intra-group re-invoiced services (HQ), not Juntos Products revenue.
    //  AVT / FVD = event anticipos booked at invoice date — they distort
    //  month-level article totals; house/tasting revenue truth is sales_daily_def.
    if (s === 'FVQ' || s === 'AVT' || s === 'FVD') return 'OTROS';
    if (s === 'FCF') return 'Tasting place';          // catering invoices
    if (s === 'AVB') return 'Juntos boutique';
    if (s.startsWith('A')) return 'Juntos house';
    if (s.startsWith('C')) return 'Picadeli';
    if (s.startsWith('FS')) return 'Juntos farm shop';
    if (s.startsWith('FT') || ['FVE', 'FVM', 'FVT'].includes(s)) return 'Tasting place';
    if (s.startsWith('FV')) return 'Distribution b2b';
    if (s.startsWith('JV')) return 'Juntos Products';
    return 'OTROS';
};

const raw = fs.readFileSync(CSV_FILE, 'latin1');
const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
const header = splitLine(lines[0]).map(h => h.trim());
const col = (name) => header.findIndex(h => h.toUpperCase().includes(name));
const I = {
    anio: 0, mes: 1,
    fecha: header.findIndex(h => h.toUpperCase() === 'FECHA'),
    serie: col('NUMSERIE'), area: col('AREA'), imp: col('IMPORTE'), uds: col('UNIDADES'),
    cli: col('NOMBRECLI'), desc: col('DESCRIPCION'), dept: col('DEPARTAMENTO'), sec: col('SECCION'), fam: col('FAMILIA'),
};

const records = [];
const perBu = {};
let badDate = 0, dupHash = 0;
const seen = new Set();
let minD = null, maxD = null;

for (let li = 1; li < lines.length; li++) {
    const f = splitLine(lines[li]);
    if (f.length < 5) continue;
    const date = parseFecha(f[I.fecha], f[I.mes], f[I.anio]);
    if (!date) { badDate++; continue; }
    if (date < '2024-01-01' || date > '2027-12-31') continue;
    const numserie = (f[I.serie] || '').trim();
    const bu = buFromSerie(numserie);
    const area = (f[I.area] || '').trim();
    const cliente = (f[I.cli] || '').trim();
    const descRaw = (f[I.desc] || '').trim();
    const departamento = (f[I.dept] || '').trim();
    const seccion = (f[I.sec] || '').trim();
    const familia = (f[I.fam] || '').trim();
    const uds = numEU(f[I.uds]);
    const importe = numEU(f[I.imp]);

    // deterministic hash over the query's GROUP BY key → idempotent re-imports
    const hash = crypto.createHash('sha1')
        .update([date, numserie, area, cliente, descRaw, departamento, seccion, familia].join('|'))
        .digest('hex');
    if (seen.has(hash)) { dupHash++; continue; }
    seen.add(hash);

    if (!minD || date < minD) minD = date;
    if (!maxD || date > maxD) maxD = date;
    const p = perBu[bu] || (perBu[bu] = { rows: 0, imp: 0, uds: 0 });
    p.rows++; p.imp += importe; p.uds += uds;

    records.push({
        date, bu, numserie, area_negocio: area, cliente,
        descripcion: normalizeDesc(descRaw), descripcion_raw: descRaw,
        departamento, seccion, familia,
        uds: Math.round(uds * 1000) / 1000, importe: Math.round(importe * 100) / 100,
        row_hash: hash,
    });
}

const eur = n => '€' + Math.round(n).toLocaleString('en-US');
console.log(`File: ${CSV_FILE}`);
console.log(`Parsed ${records.length} rows | dates ${minD}..${maxD} | badDate=${badDate} | dupHash collapsed=${dupHash}`);
console.log('Per BU:');
for (const [bu, v] of Object.entries(perBu).sort((a, b) => b[1].imp - a[1].imp))
    console.log(`  ${bu.padEnd(18)} ${String(v.rows).padStart(7)} rows  ${eur(v.imp).padStart(13)}  ${Math.round(v.uds).toLocaleString('en-US').padStart(10)} uds`);

if (!APPLY) { console.log('\nDRY RUN — pass --apply to write to Supabase.'); process.exit(0); }

const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const BATCH = 1000;
let up = 0, failed = 0;
for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase.from(TABLE).upsert(batch, { onConflict: 'row_hash' });
    if (error) { console.error(`batch ${i / BATCH + 1} error:`, error.message); failed += batch.length; }
    else up += batch.length;
    process.stdout.write(`\rUpserted ${up}/${records.length}...`);
}
console.log(`\nDone. Upserted ${up} rows${failed ? `, ${failed} failed` : ''}.`);

// Refresh the Product Intelligence materialized view (pi_product_bu_year) so the
// dashboard's cross-channel / Pareto / menu-eng / price views pick up new data.
const { error: refErr } = await supabase.rpc('pi_refresh');
if (refErr) console.error('pi_refresh failed (run manually):', refErr.message);
else console.log('pi_product_bu_year refreshed.');
