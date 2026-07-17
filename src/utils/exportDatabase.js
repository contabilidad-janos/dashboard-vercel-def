import * as XLSX from 'xlsx';
import { supabase } from '../services/supabaseClient';

// Full curated-database Excel export ("mi jefe prefiere mirar las cosas en excel").
// One workbook, five sheets, all figures NET (sin IVA), OTROS excluded:
//   1. Diario por BU    — date × BU: ingresos, unidades, pax/tickets
//   2. Mensual por BU   — month × BU: ingresos, pax, unidades, días abiertos
//   3. Anual por BU     — year × BU rollup
//   4. Productos (año)  — product × BU × year from the pre-aggregated MV
//   5. Notas            — sources, definitions, cutoffs
// ~14k rows total: fetches in a few seconds, generates client-side.

const BUS = ['Juntos house', 'Juntos boutique', 'Picadeli', 'Juntos farm shop', 'Tasting place', 'Distribution b2b', 'Juntos Products', 'Activities'];
const BU_LABEL = { Picadeli: 'Juntos deli (Picadeli)' };
const label = (bu) => BU_LABEL[bu] || bu;

async function fetchAll(table, select, extraFilter) {
    let all = [];
    const chunk = 1000;
    for (let from = 0; ; from += chunk) {
        let q = supabase.from(table).select(select).range(from, from + chunk - 1);
        if (extraFilter) q = extraFilter(q);
        const { data, error } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
        if (data && data.length) { all = all.concat(data); if (data.length < chunk) break; }
        else break;
    }
    return all;
}

const parseVol = (v) => {
    if (v == null || v === '') return 0;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

export async function exportFullDatabase(onProgress = () => { }) {
    onProgress('Descargando ventas diarias…');
    const ddef = await fetchAll('sales_daily_def', 'date, business_unit, revenue, "VOLUME"',
        (q) => q.gte('date', '2024-01-01').lte('date', '2030-12-31').order('date', { ascending: true }));

    onProgress('Descargando pax/tickets…');
    const recs = await fetchAll('sales_records', 'date, transaction_count, business_units(name)',
        (q) => q.gte('date', '2024-01-01').order('date', { ascending: true }));

    onProgress('Descargando productos…');
    const prods = await fetchAll('pi_product_bu_year', 'descripcion, name, dept, seccion, bu, yr, uds, rev');

    onProgress('Generando Excel…');

    // merge daily: (date|bu) -> {rev, units, pax}
    const daily = new Map();
    const keyOf = (d, b) => `${d}|${b}`;
    for (const r of ddef) {
        const bu = (r.business_unit || '').trim();
        if (!BUS.includes(bu)) continue;
        const k = keyOf(r.date, bu);
        const cur = daily.get(k) || { date: r.date, bu, rev: 0, units: 0, pax: 0 };
        cur.rev += Number(r.revenue) || 0;
        cur.units += parseVol(r.VOLUME);
        daily.set(k, cur);
    }
    for (const r of recs) {
        const bu = ((r.business_units && r.business_units.name) || '').trim();
        if (!BUS.includes(bu)) continue;
        const k = keyOf(r.date, bu);
        const cur = daily.get(k) || { date: r.date, bu, rev: 0, units: 0, pax: 0 };
        cur.pax += Number(r.transaction_count) || 0;
        daily.set(k, cur);
    }
    const dailyRows = [...daily.values()]
        .filter(r => r.rev !== 0 || r.pax !== 0 || r.units !== 0)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.bu.localeCompare(b.bu)));

    // monthly + yearly rollups (open day = rev>0 or pax>0, the standard definition)
    const monthly = new Map(); // ym|bu
    const yearly = new Map();  // y|bu
    for (const r of dailyRows) {
        const ym = r.date.slice(0, 7);
        const y = r.date.slice(0, 4);
        const open = (r.rev > 0 || r.pax > 0) ? 1 : 0;
        for (const [map, k] of [[monthly, `${ym}|${r.bu}`], [yearly, `${y}|${r.bu}`]]) {
            const cur = map.get(k) || { period: k.split('|')[0], bu: r.bu, rev: 0, pax: 0, units: 0, open: 0 };
            cur.rev += r.rev; cur.pax += r.pax; cur.units += r.units; cur.open += open;
            map.set(k, cur);
        }
    }
    const r2 = (n) => Math.round(n * 100) / 100;

    const wb = XLSX.utils.book_new();

    // 1. Diario
    const wsDaily = XLSX.utils.aoa_to_sheet([
        ['Fecha', 'Unidad de negocio', 'Ingresos € (neto)', 'Unidades vendidas', 'Pax / Tickets / Pedidos'],
        ...dailyRows.map(r => [r.date, label(r.bu), r2(r.rev), r2(r.units), r.pax]),
    ]);
    wsDaily['!cols'] = [{ wch: 11 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Diario por BU');

    // 2. Mensual
    const monthlyRows = [...monthly.values()].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : a.bu.localeCompare(b.bu)));
    const wsMonthly = XLSX.utils.aoa_to_sheet([
        ['Mes', 'Unidad de negocio', 'Ingresos € (neto)', 'Pax / Tickets', 'Unidades vendidas', 'Días abiertos'],
        ...monthlyRows.map(r => [r.period, label(r.bu), r2(r.rev), r.pax, r2(r.units), r.open]),
    ]);
    wsMonthly['!cols'] = [{ wch: 9 }, { wch: 24 }, { wch: 16 }, { wch: 13 }, { wch: 16 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, wsMonthly, 'Mensual por BU');

    // 3. Anual
    const yearlyRows = [...yearly.values()].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : a.bu.localeCompare(b.bu)));
    const wsYearly = XLSX.utils.aoa_to_sheet([
        ['Año', 'Unidad de negocio', 'Ingresos € (neto)', 'Pax / Tickets', 'Unidades vendidas', 'Días abiertos'],
        ...yearlyRows.map(r => [r.period, label(r.bu), r2(r.rev), r.pax, r2(r.units), r.open]),
    ]);
    wsYearly['!cols'] = [{ wch: 7 }, { wch: 24 }, { wch: 16 }, { wch: 13 }, { wch: 16 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, wsYearly, 'Anual por BU');

    // 4. Productos (año)
    const prodRows = prods
        .filter(p => p.bu !== 'OTROS')
        .sort((a, b) => a.bu.localeCompare(b.bu) || (b.yr - a.yr) || (Number(b.rev) - Number(a.rev)));
    const wsProd = XLSX.utils.aoa_to_sheet([
        ['Unidad de negocio', 'Año', 'Producto', 'Departamento', 'Sección', 'Unidades', 'Ingresos € (neto)'],
        ...prodRows.map(p => [label(p.bu), p.yr, p.name || p.descripcion, p.dept || '', p.seccion || '', r2(Number(p.uds)), r2(Number(p.rev))]),
    ]);
    wsProd['!cols'] = [{ wch: 22 }, { wch: 6 }, { wch: 38 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsProd, 'Productos por año');

    // 5. Notas
    const today = new Date().toISOString().slice(0, 10);
    const maxDate = dailyRows.length ? dailyRows[dailyRows.length - 1].date : '';
    const wsNotes = XLSX.utils.aoa_to_sheet([
        ['Juntos — Base de datos curada del dashboard'],
        [`Generado: ${today} · Datos hasta: ${maxDate} · Rango: 2024-01-01 en adelante`],
        [],
        ['Hoja', 'Contenido'],
        ['Diario por BU', 'Una fila por día y unidad de negocio. Ingresos NETOS (sin IVA). Unidades = productos vendidos. Pax/Tickets = comensales (house, tasting), tickets (deli, boutique, farm shop) o pedidos (distribución, products).'],
        ['Mensual por BU', 'Agregado mensual. "Días abiertos" = días con ingresos (>0€) o volumen registrado.'],
        ['Anual por BU', 'Agregado anual con los mismos criterios.'],
        ['Productos por año', 'Ventas por artículo (fuente ICG, importe neto de línea). Excluye anticipos de eventos (AVT/FVD), servicios intra-grupo (FVQ) y el cajón OTROS. Las devoluciones restan.'],
        [],
        ['Notas importantes'],
        ['· Todos los importes son SIN IVA (base imponible). Para IVA incluido: +10% restauración/alimentación, +21% retail-boutique.'],
        ['· Juntos house: ingresos desde su hoja de reporting (DataBase); el resto desde el reporting diario consolidado.'],
        ['· Un día sin fila = sin ventas registradas (cierre real o dato aún no importado).'],
        ['· La actualización es semanal (import de los lunes).'],
    ]);
    wsNotes['!cols'] = [{ wch: 20 }, { wch: 130 }];
    XLSX.utils.book_append_sheet(wb, wsNotes, 'Notas');

    XLSX.writeFile(wb, `Juntos_BD_curada_${today}.xlsx`);
    onProgress('');
    return { dailyRows: dailyRows.length, monthlyRows: monthlyRows.length, prodRows: prodRows.length };
}
