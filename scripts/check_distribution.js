#!/usr/bin/env node
// Analyse the tickets CSV: per-BU ticket counts, splitting positive vs refund rows.
import fs from 'fs';
import { parse as csvParse } from 'csv-parse/sync';

const buFromSerie = (serie) => {
    const s = (serie || '').trim().toUpperCase();
    if (!s || s === 'FVQ') return 'FVQ (skipped)';
    if (s === 'AVB') return 'Juntos boutique (own sheet)';
    if (s.startsWith('A')) return 'Juntos house (own sheet)';
    if (s.startsWith('C')) return 'Picadeli';
    if (s.startsWith('FS')) return 'Juntos farm shop';
    if (s.startsWith('FT') || ['FVE', 'FVD', 'FVM', 'FVT'].includes(s)) return 'Tasting (own sheet)';
    if (s.startsWith('FV')) return 'Distribution b2b';
    if (s.startsWith('JV')) return 'Juntos Products';
    return 'OTHER (skipped)';
};

const parseNum = (s) => parseFloat(String(s || '0').replace(/[^0-9.-]/g, '')) || 0;
const intOnly = (s) => parseInt(String(s || '0').replace(/[^0-9-]/g, ''), 10) || 0;

const raw = fs.readFileSync('downloadbyjanos/ventas para reporting tickets.xlsx - Hoja1.csv', 'utf8');
const rows = csvParse(raw, { columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true });

const agg = {}; // bu -> { posTk, negTk, posRows, negRows, series:Set }
for (const r of rows) {
    const bu = buFromSerie(r.NUMSERIE);
    const tk = intOnly(r.TOTALTIQUETS);
    const base = parseNum(r.BASEIMPONIBLE);
    if (!agg[bu]) agg[bu] = { posTk: 0, negTk: 0, posRows: 0, negRows: 0, series: {} };
    const a = agg[bu];
    if (base < 0 || tk < 0) { a.negTk += tk; a.negRows++; }
    else { a.posTk += tk; a.posRows++; }
    a.series[(r.NUMSERIE || '').trim().toUpperCase()] = (a.series[(r.NUMSERIE || '').trim().toUpperCase()] || 0) + 1;
}

console.log('How the tickets CSV maps to BUs (TOTALTIQUETS = ticket/invoice count per series/day):\n');
console.log('BU'.padEnd(30), 'posTk'.padStart(7), 'refundTk'.padStart(9), 'posRows'.padStart(8), 'refundRows'.padStart(11), '  series');
for (const [bu, a] of Object.entries(agg).sort((x, y) => y[1].posTk - x[1].posTk)) {
    const series = Object.entries(a.series).sort((x, y) => y[1] - x[1]).map(([s, n]) => `${s}:${n}`).join(' ');
    console.log(bu.padEnd(30), String(a.posTk).padStart(7), String(a.negTk).padStart(9),
        String(a.posRows).padStart(8), String(a.negRows).padStart(11), '  ' + series);
}

// Distribution-specific: current importer count (includes refunds) vs positive-only
console.log('\n── Distribution b2b detail ──');
const distRows = rows.filter(r => buFromSerie(r.NUMSERIE) === 'Distribution b2b');
let curr = 0, pos = 0;
const refundList = [];
for (const r of distRows) {
    const tk = intOnly(r.TOTALTIQUETS);
    const base = parseNum(r.BASEIMPONIBLE);
    curr += tk;
    if (base >= 0 && tk >= 0) pos += tk;
    else refundList.push(`${r.Fecha}  ${r.NUMSERIE}  tk=${tk}  base=${base}`);
}
console.log(`Current importer count (sum TOTALTIQUETS incl. refunds): ${curr}`);
console.log(`Positive-only (real orders):                            ${pos}`);
console.log(`Refund/credit rows wrongly counted as orders: ${refundList.length} rows, ${curr - pos} tickets`);
refundList.forEach(x => console.log('   ' + x));
