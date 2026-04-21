import React, { useState, useMemo } from 'react';
import { Download, ArrowUpDown, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const COLUMNS = [
    { key: 'rank', label: '#', numeric: true, sortable: false },
    { key: 'descripcion_raw', label: 'Product', numeric: false },
    { key: 'departamento', label: 'Depto', numeric: false },
    { key: 'seccion', label: 'Sección', numeric: false },
    { key: 'marca_mapeada', label: 'Proveedor', numeric: false },
    { key: 'units', label: 'Units', numeric: true, fmt: v => formatNumber(v) },
    { key: 'revenue', label: 'Revenue', numeric: true, fmt: v => formatCurrency(v) },
    { key: 'avgPrice', label: 'Avg €', numeric: true, fmt: v => formatCurrency(v) },
    { key: 'pctRevenue', label: '% Rev', numeric: true, fmt: v => `${v.toFixed(1)}%` },
    { key: 'velocity', label: 'Vel. uds/día', numeric: true, fmt: v => v.toFixed(2) },
    { key: 'daysSinceSold', label: 'Días sin venta', numeric: true, fmt: v => v == null ? '—' : formatNumber(v) },
];

const STALE_DAYS = 14;

const PicadeliTopProductsTable = ({ products, windowDays }) => {
    const [sortKey, setSortKey] = useState('revenue');
    const [sortDir, setSortDir] = useState('desc');
    const [showAll, setShowAll] = useState(false);

    const sorted = useMemo(() => {
        const arr = [...products];
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
    }, [products, sortKey, sortDir]);

    const visible = showAll ? sorted : sorted.slice(0, 50);

    const toggleSort = (key) => {
        if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const replenishmentCandidates = useMemo(() => {
        return [...products]
            .filter(p => p.units > 0)
            .sort((a, b) => b.velocity - a.velocity)
            .slice(0, 10);
    }, [products]);

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

    return (
        <div className="space-y-6">
            {/* Replenishment panel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-lg font-serif text-primary">Replenishment candidates</h3>
                        <p className="text-xs text-gray-500 mt-1">Top 10 by sales velocity — prioritise restock.</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>Based on sales velocity only — no stock data connected.</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="py-2 px-4 text-left font-semibold">Product</th>
                                <th className="py-2 px-4 text-right font-semibold">Units ({windowDays}d)</th>
                                <th className="py-2 px-4 text-right font-semibold">Velocity uds/día</th>
                                <th className="py-2 px-4 text-right font-semibold">Days since sold</th>
                                <th className="py-2 px-4 text-right font-semibold">Revenue</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {replenishmentCandidates.map(p => (
                                <tr key={p.descripcion} className="hover:bg-green-50/30">
                                    <td className="py-2 px-4 font-medium text-gray-800">{p.descripcion_raw}</td>
                                    <td className="py-2 px-4 text-right tabular-nums">{formatNumber(p.units)}</td>
                                    <td className="py-2 px-4 text-right tabular-nums font-semibold text-primary">{p.velocity.toFixed(2)}</td>
                                    <td className="py-2 px-4 text-right tabular-nums">
                                        {p.daysSinceSold == null ? '—' : (
                                            <span className={clsx(p.daysSinceSold > STALE_DAYS && 'text-red-600 font-semibold')}>
                                                {p.daysSinceSold}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(p.revenue)}</td>
                                </tr>
                            ))}
                            {replenishmentCandidates.length === 0 && (
                                <tr><td colSpan={5} className="py-6 text-center text-gray-400 italic">No data in selected range.</td></tr>
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
                        <p className="text-xs text-gray-500 mt-1">{sorted.length} products — showing {visible.length}.</p>
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
                            {visible.map(p => (
                                <tr key={p.descripcion} className="hover:bg-green-50/30">
                                    <td className="py-2 px-4 text-right tabular-nums text-gray-400">{p.rank}</td>
                                    <td className="py-2 px-4 font-medium text-gray-800 max-w-[280px] truncate" title={p.descripcion_raw}>{p.descripcion_raw}</td>
                                    <td className="py-2 px-4 text-gray-600">{p.departamento || '—'}</td>
                                    <td className="py-2 px-4 text-gray-600">{p.seccion || '—'}</td>
                                    <td className="py-2 px-4 text-gray-600">{p.marca_mapeada || '—'}</td>
                                    <td className="py-2 px-4 text-right tabular-nums">{formatNumber(p.units)}</td>
                                    <td className="py-2 px-4 text-right tabular-nums font-semibold">{formatCurrency(p.revenue)}</td>
                                    <td className="py-2 px-4 text-right tabular-nums">{formatCurrency(p.avgPrice)}</td>
                                    <td className="py-2 px-4 text-right tabular-nums">{p.pctRevenue.toFixed(1)}%</td>
                                    <td className="py-2 px-4 text-right tabular-nums">{p.velocity.toFixed(2)}</td>
                                    <td className="py-2 px-4 text-right tabular-nums">
                                        {p.daysSinceSold == null ? '—' : (
                                            <span className={clsx(p.daysSinceSold > STALE_DAYS && 'text-red-600 font-semibold')}>
                                                {p.daysSinceSold}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
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
