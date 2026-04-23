import React, { useState, useMemo } from 'react';
import { Download, ArrowUpDown, AlertTriangle, Package } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { pctDelta } from '../../utils/compare';

const BASE_COLUMNS = [
    { key: 'rank', label: '#', numeric: true, sortable: false },
    { key: 'descripcion_raw', label: 'Product', numeric: false },
    { key: 'departamento', label: 'Depto', numeric: false },
    { key: 'seccion', label: 'Sección', numeric: false },
    { key: 'marca_mapeada', label: 'Proveedor', numeric: false },
    { key: 'units', label: 'Units', numeric: true, fmt: v => formatNumber(v) },
    { key: 'revenue', label: 'Revenue', numeric: true, fmt: v => formatCurrency(v) },
    { key: 'avgPrice', label: 'Avg €', numeric: true, fmt: v => formatCurrency(v) },
    { key: 'pctRevenue', label: '% Rev', numeric: true, fmt: v => `${v.toFixed(1)}%` },
    { key: 'publicShare', label: '% Público', numeric: true, fmt: v => `${v.toFixed(0)}%` },
    { key: 'topNamedClient', label: 'Cliente top (no varios)', numeric: false, sortable: false },
    { key: 'velocity', label: 'Vel. uds/día', numeric: true, fmt: v => v.toFixed(2) },
    { key: 'stockUnits', label: 'Stock', numeric: true, fmt: v => v == null ? '—' : formatNumber(v) },
    { key: 'daysOfStock', label: 'Días stock', numeric: true, fmt: v => v == null ? '—' : v.toFixed(1) },
    { key: 'daysSinceSold', label: 'Días sin venta', numeric: true, fmt: v => v == null ? '—' : formatNumber(v) },
];

// Compare columns inserted right after revenue/units when Period B is active.
const COMPARE_COLUMNS = [
    { key: 'revenueB', label: 'Rev B', numeric: true, fmt: v => v == null ? '—' : formatCurrency(v) },
    { key: 'dRevenue', label: 'Δ Rev %', numeric: true, fmt: v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`, compareCell: true },
    { key: 'unitsB', label: 'Units B', numeric: true, fmt: v => v == null ? '—' : formatNumber(v) },
    { key: 'dUnits', label: 'Δ Units %', numeric: true, fmt: v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`, compareCell: true },
];

const STALE_DAYS = 14;
const NAMED_DOMINANCE_THRESHOLD = 50;
const LOW_STOCK_DAYS = 7;      // <= 7 días de stock → crítico (rojo)
const WARN_STOCK_DAYS = 14;    // <= 14 días → aviso (ámbar)

const PicadeliTopProductsTable = ({ products, windowDays, inventorySnapshotDate, onSelectProduct, compareByDesc = null, compareRange = null }) => {
    const [sortKey, setSortKey] = useState('revenue');
    const [sortDir, setSortDir] = useState('desc');
    const [showAll, setShowAll] = useState(false);
    // Replenishment modes: 'velocity' (old behaviour) vs 'urgent' (low days-of-stock first, public velocity > 0)
    const [replMode, setReplMode] = useState(inventorySnapshotDate ? 'urgent' : 'velocity');

    // Decorate products with compare columns when Period B is active.
    const decorated = useMemo(() => {
        if (!compareByDesc) return products;
        return products.map(p => {
            const b = compareByDesc.get(p.descripcion);
            return {
                ...p,
                revenueB: b?.revenue ?? null,
                unitsB: b?.units ?? null,
                dRevenue: b ? pctDelta(p.revenue, b.revenue) : null,
                dUnits: b ? pctDelta(p.units, b.units) : null,
            };
        });
    }, [products, compareByDesc]);

    const COLUMNS = useMemo(() => {
        if (!compareByDesc) return BASE_COLUMNS;
        // Insert compare columns right after 'revenue'
        const out = [];
        for (const col of BASE_COLUMNS) {
            out.push(col);
            if (col.key === 'revenue') out.push(COMPARE_COLUMNS[0], COMPARE_COLUMNS[1]);
            if (col.key === 'units') out.push(COMPARE_COLUMNS[2], COMPARE_COLUMNS[3]);
        }
        return out;
    }, [compareByDesc]);

    const sorted = useMemo(() => {
        const arr = [...decorated];
        arr.sort((a, b) => {
            const va = a[sortKey], vb = b[sortKey];
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (typeof va === 'number' && typeof vb === 'number') {
                return sortDir === 'asc' ? va - vb : vb - va;
            }
            return sortDir === 'asc'
                ? String(va).localeCompare(String(vb))
                : String(vb).localeCompare(String(va));
        });
        return arr.map((r, i) => ({ ...r, rank: i + 1 }));
    }, [decorated, sortKey, sortDir]);

    const visible = showAll ? sorted : sorted.slice(0, 50);

    const toggleSort = (key) => {
        if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const replenishmentCandidates = useMemo(() => {
        if (replMode === 'urgent') {
            // Products with inventory data AND public demand, sorted by days-of-stock asc.
            // Fallback: products flagged dominated by named clients are still shown but deprioritised.
            return [...products]
                .filter(p => p.hasInventory && p.publicVelocity > 0 && p.daysOfStock != null)
                .sort((a, b) => a.daysOfStock - b.daysOfStock)
                .slice(0, 15);
        }
        return [...products]
            .filter(p => p.units > 0)
            .sort((a, b) => b.velocity - a.velocity)
            .slice(0, 10);
    }, [products, replMode]);

    const handleDownload = () => {
        const header = COLUMNS.filter(c => c.key !== 'rank').map(c => c.label).join(',');
        const rows = sorted.map(r => COLUMNS
            .filter(c => c.key !== 'rank')
            .map(c => {
                const v = r[c.key];
                if (v == null) return '';
                if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`;
                return typeof v === 'number' ? v : String(v);
            })
            .join(',')
        );
        const csv = 'data:text/csv;charset=utf-8,' + [header, ...rows].join('\n');
        const link = document.createElement('a');
        link.setAttribute('href', encodeURI(csv));
        link.setAttribute('download', `picadeli_products_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Compare cell classnames: green on positive delta, red on negative.
    const deltaCls = (v) => {
        if (v == null) return 'text-gray-300';
        if (v > 0) return 'text-emerald-700 font-semibold';
        if (v < 0) return 'text-red-700 font-semibold';
        return 'text-gray-600';
    };
    const fmtDelta = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;

    return (
        <div className="space-y-6">
            {/* Replenishment panel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                    <div>
                        <h3 className="text-lg font-serif text-primary">Replenishment candidates</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            {replMode === 'urgent'
                                ? 'Ordenado por días de stock restante (según velocidad pública). Rojo ≤7d, ámbar ≤14d.'
                                : 'Top 10 por velocidad de venta — prioriza restock. Ámbar = dominado por cliente nombrado.'}
                        </p>
                        {inventorySnapshotDate && (
                            <p className="text-[11px] text-gray-400 mt-0.5">Inventario snapshot: {inventorySnapshotDate}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {inventorySnapshotDate && (
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                                {[
                                    { v: 'urgent', l: 'Urgente (stock)' },
                                    { v: 'velocity', l: 'Velocidad' },
                                ].map(opt => (
                                    <button
                                        key={opt.v}
                                        onClick={() => setReplMode(opt.v)}
                                        className={clsx(
                                            'px-3 py-1 text-xs font-medium rounded-md transition',
                                            replMode === opt.v ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                        )}
                                    >{opt.l}</button>
                                ))}
                            </div>
                        )}
                        {!inventorySnapshotDate && (
                            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-sm">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                <span>Sin inventario — solo velocidad.</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="py-2 px-4 text-left font-semibold">Product</th>
                                <th className="py-2 px-4 text-right font-semibold">Stock</th>
                                <th className="py-2 px-4 text-right font-semibold">Días stock</th>
                                <th className="py-2 px-4 text-right font-semibold">Vel. pública</th>
                                <th className="py-2 px-4 text-right font-semibold">Units ({windowDays}d)</th>
                                <th className="py-2 px-4 text-right font-semibold">% Público</th>
                                <th className="py-2 px-4 text-right font-semibold">Revenue</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {replenishmentCandidates.map(p => {
                                const dominated = (p.namedShare || 0) > NAMED_DOMINANCE_THRESHOLD;
                                const stockCritical = p.daysOfStock != null && p.daysOfStock <= LOW_STOCK_DAYS;
                                const stockWarn = p.daysOfStock != null && p.daysOfStock > LOW_STOCK_DAYS && p.daysOfStock <= WARN_STOCK_DAYS;
                                return (
                                    <tr
                                        key={p.descripcion}
                                        onClick={() => onSelectProduct && onSelectProduct(p.descripcion)}
                                        className={clsx(
                                            'cursor-pointer',
                                            stockCritical ? 'bg-red-50/40 hover:bg-red-50/60' : (dominated ? 'bg-amber-50/40 hover:bg-amber-50/60' : 'hover:bg-green-50/30')
                                        )}
                                    >
                                        <td className="py-2 px-4 font-medium text-gray-800">
                                            <span className="inline-flex items-center gap-1.5">
                                                {stockCritical && (
                                                    <span title={`Stock crítico: ${p.daysOfStock.toFixed(1)} días`}>
                                                        <Package className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                                                    </span>
                                                )}
                                                {dominated && !stockCritical && (
                                                    <span title={`Consumo interno/B2B: ${p.topNamedClient} = ${p.topNamedClientShare.toFixed(0)}%`}>
                                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                                    </span>
                                                )}
                                                {p.descripcion_raw}
                                            </span>
                                            {dominated && p.topNamedClient && (
                                                <div className="text-[10px] text-amber-700 mt-0.5">
                                                    {p.topNamedClient} ({p.topNamedClientShare.toFixed(0)}%)
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-2 px-4 text-right tabular-nums">
                                            {p.stockUnits == null ? <span className="text-gray-300">—</span> : formatNumber(p.stockUnits)}
                                        </td>
                                        <td className="py-2 px-4 text-right tabular-nums">
                                            {p.daysOfStock == null ? <span className="text-gray-300">—</span> : (
                                                <span className={clsx(
                                                    'font-semibold',
                                                    stockCritical && 'text-red-700',
                                                    stockWarn && 'text-amber-700',
                                                    !stockCritical && !stockWarn && 'text-gray-700'
                                                )}>{p.daysOfStock.toFixed(1)}d</span>
                                            )}
                                        </td>
                                        <td className="py-2 px-4 text-right tabular-nums text-primary">{p.publicVelocity.toFixed(2)}</td>
                                        <td className="py-2 px-4 text-right tabular-nums">{formatNumber(p.units)}</td>
                                        <td className="py-2 px-4 text-right tabular-nums">
                                            <span className={clsx(p.publicShare < NAMED_DOMINANCE_THRESHOLD ? 'text-amber-700 font-semibold' : 'text-gray-600')}>
                                                {p.publicShare.toFixed(0)}%
                                            </span>
                                        </td>
                                        <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(p.revenue)}</td>
                                    </tr>
                                );
                            })}
                            {replenishmentCandidates.length === 0 && (
                                <tr><td colSpan={7} className="py-6 text-center text-gray-400 italic">
                                    {replMode === 'urgent' ? 'Sin productos con inventario y velocidad pública > 0 en este rango.' : 'No data in selected range.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Full ranked table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-lg font-serif text-primary">All products</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            {sorted.length} products — showing {visible.length}.
                            {compareRange && (
                                <span className="ml-2 text-amber-700">
                                    · Comparando con B: {compareRange.start} → {compareRange.end}
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {sorted.length > 50 && (
                            <button
                                onClick={() => setShowAll(s => !s)}
                                className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:border-accent hover:text-accent"
                            >
                                {showAll ? 'Show top 50' : `Show all ${sorted.length}`}
                            </button>
                        )}
                        <button
                            onClick={handleDownload}
                            className="inline-flex items-center gap-2 bg-primary hover:bg-opacity-90 text-white text-sm font-medium py-1.5 px-3 rounded-lg transition-colors"
                        >
                            <Download className="w-4 h-4" /> CSV
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <tr>
                                {COLUMNS.map(c => (
                                    <th
                                        key={c.key}
                                        onClick={() => c.sortable !== false && toggleSort(c.key)}
                                        className={clsx(
                                            'py-3 px-4 font-semibold whitespace-nowrap',
                                            c.numeric ? 'text-right' : 'text-left',
                                            c.sortable !== false && 'cursor-pointer hover:text-primary select-none'
                                        )}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {c.label}
                                            {c.sortable !== false && <ArrowUpDown className={clsx('w-3 h-3', sortKey === c.key ? 'text-primary' : 'text-gray-300')} />}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {visible.map(p => {
                                const dominated = (p.namedShare || 0) > NAMED_DOMINANCE_THRESHOLD;
                                const stockCritical = p.daysOfStock != null && p.daysOfStock <= LOW_STOCK_DAYS;
                                const stockWarn = p.daysOfStock != null && p.daysOfStock > LOW_STOCK_DAYS && p.daysOfStock <= WARN_STOCK_DAYS;
                                return (
                                    <tr
                                        key={p.descripcion}
                                        onClick={() => onSelectProduct && onSelectProduct(p.descripcion)}
                                        className={clsx('cursor-pointer hover:bg-green-50/30', dominated && 'bg-amber-50/30')}
                                    >
                                        <td className="py-2 px-4 text-right tabular-nums text-gray-400">{p.rank}</td>
                                        <td className="py-2 px-4 font-medium text-gray-800 max-w-[280px] truncate" title={p.descripcion_raw}>
                                            <span className="inline-flex items-center gap-1.5">
                                                {dominated && (
                                                    <span title={`Consumo interno/B2B: ${(100 - p.publicShare).toFixed(0)}% de la venta no es público`}>
                                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                                    </span>
                                                )}
                                                <span className="truncate">{p.descripcion_raw}</span>
                                            </span>
                                        </td>
                                        <td className="py-2 px-4 text-gray-600">{p.departamento || '—'}</td>
                                        <td className="py-2 px-4 text-gray-600">{p.seccion || '—'}</td>
                                        <td className="py-2 px-4 text-gray-600">{p.marca_mapeada || '—'}</td>
                                        <td className="py-2 px-4 text-right tabular-nums">{formatNumber(p.units)}</td>
                                        {compareByDesc && (
                                            <>
                                                <td className="py-2 px-4 text-right tabular-nums text-gray-500">{p.unitsB == null ? '—' : formatNumber(p.unitsB)}</td>
                                                <td className={clsx('py-2 px-4 text-right tabular-nums', deltaCls(p.dUnits))}>{fmtDelta(p.dUnits)}</td>
                                            </>
                                        )}
                                        <td className="py-2 px-4 text-right tabular-nums font-semibold">{formatCurrency(p.revenue)}</td>
                                        {compareByDesc && (
                                            <>
                                                <td className="py-2 px-4 text-right tabular-nums text-gray-500">{p.revenueB == null ? '—' : formatCurrency(p.revenueB)}</td>
                                                <td className={clsx('py-2 px-4 text-right tabular-nums', deltaCls(p.dRevenue))}>{fmtDelta(p.dRevenue)}</td>
                                            </>
                                        )}
                                        <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(p.avgPrice)}</td>
                                        <td className="py-2 px-4 text-right tabular-nums">{p.pctRevenue.toFixed(1)}%</td>
                                        <td className="py-2 px-4 text-right tabular-nums">
                                            <span className={clsx(p.publicShare < NAMED_DOMINANCE_THRESHOLD ? 'text-amber-700 font-semibold' : 'text-gray-700')}>
                                                {p.publicShare.toFixed(0)}%
                                            </span>
                                        </td>
                                        <td className="py-2 px-4 text-xs text-gray-600 max-w-[200px]">
                                            {p.topNamedClient ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <span className="truncate max-w-[140px]" title={p.topNamedClient}>{p.topNamedClient}</span>
                                                    <span className="text-gray-400">{p.topNamedClientShare.toFixed(0)}%</span>
                                                </span>
                                            ) : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="py-2 px-4 text-right tabular-nums">{p.velocity.toFixed(2)}</td>
                                        <td className="py-2 px-4 text-right tabular-nums">
                                            {p.stockUnits == null ? <span className="text-gray-300">—</span> : formatNumber(p.stockUnits)}
                                        </td>
                                        <td className="py-2 px-4 text-right tabular-nums">
                                            {p.daysOfStock == null ? <span className="text-gray-300">—</span> : (
                                                <span className={clsx(
                                                    stockCritical && 'text-red-700 font-semibold',
                                                    stockWarn && 'text-amber-700 font-semibold'
                                                )}>{p.daysOfStock.toFixed(1)}</span>
                                            )}
                                        </td>
                                        <td className="py-2 px-4 text-right tabular-nums">
                                            {p.daysSinceSold == null ? '—' : (
                                                <span className={clsx(p.daysSinceSold > STALE_DAYS && 'text-red-600 font-semibold')}>
                                                    {p.daysSinceSold}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {visible.length === 0 && (
                                <tr><td colSpan={COLUMNS.length} className="py-12 text-center text-gray-400 italic">No data in selected range.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PicadeliTopProductsTable;
