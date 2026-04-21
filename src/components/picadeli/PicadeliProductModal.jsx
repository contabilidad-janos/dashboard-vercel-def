import React, { useMemo, useEffect } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { X, Package, AlertTriangle } from 'lucide-react';
import { format, parseISO, differenceInCalendarDays, eachDayOfInterval } from 'date-fns';
import clsx from 'clsx';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const LOW_STOCK_DAYS = 7;
const WARN_STOCK_DAYS = 14;

const PicadeliProductModal = ({ productKey, rows, allRows, startDate, endDate, windowDays, product, onClose }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    // Only transactions for this SKU, across ALL clients (ignore client-exclusion
    // filter so the breakdown is complete — user can see which clients dominate).
    const txns = useMemo(() => (
        (rows || []).filter(r => r.descripcion === productKey)
    ), [rows, productKey]);

    // If the client-exclusion filter is on, `rows` has already been filtered.
    // Also expose the full (unfiltered) set so we can show the real client breakdown.
    const txnsAll = useMemo(() => (
        (allRows || []).filter(r => r.descripcion === productKey
            && r.date >= startDate && r.date <= endDate)
    ), [allRows, productKey, startDate, endDate]);

    // Daily time series
    const dailySeries = useMemo(() => {
        const byDate = new Map();
        txnsAll.forEach(r => {
            const d = r.date;
            if (!d) return;
            const agg = byDate.get(d) || { units: 0, revenue: 0 };
            agg.units += Number(r.uds) || 0;
            agg.revenue += Number(r.importe) || 0;
            byDate.set(d, agg);
        });
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        const days = eachDayOfInterval({ start, end });
        const labels = days.map(d => format(d, 'yyyy-MM-dd'));
        const units = labels.map(l => byDate.get(l)?.units || 0);
        const revenue = labels.map(l => byDate.get(l)?.revenue || 0);
        return { labels, units, revenue };
    }, [txnsAll, startDate, endDate]);

    // Hour-of-day
    const hourly = useMemo(() => {
        const rev = new Array(24).fill(0);
        const uds = new Array(24).fill(0);
        txnsAll.forEach(r => {
            const h = Number(r.hour);
            if (!Number.isFinite(h) || h < 0 || h > 23) return;
            rev[h] += Number(r.importe) || 0;
            uds[h] += Number(r.uds) || 0;
        });
        const firstH = 7, lastH = 23;
        const labels = [], units = [];
        for (let h = firstH; h <= lastH; h++) {
            labels.push(`${String(h).padStart(2, '0')}:00`);
            units.push(uds[h]);
        }
        return { labels, units };
    }, [txnsAll]);

    // Client breakdown (computed on unfiltered txns so Christian & co. always show up here)
    const clientBreakdown = useMemo(() => {
        const by = new Map();
        txnsAll.forEach(r => {
            const c = r.cliente || '(sin cliente)';
            const agg = by.get(c) || { units: 0, revenue: 0, lines: 0 };
            agg.units += Number(r.uds) || 0;
            agg.revenue += Number(r.importe) || 0;
            agg.lines += 1;
            by.set(c, agg);
        });
        const totalRev = [...by.values()].reduce((s, v) => s + v.revenue, 0) || 1;
        return [...by.entries()]
            .map(([cliente, v]) => ({ cliente, ...v, share: (v.revenue / totalRev) * 100 }))
            .sort((a, b) => b.revenue - a.revenue);
    }, [txnsAll]);

    // Recent velocity (last 7 days of the range) vs. window average
    const recent7dVelocity = useMemo(() => {
        const end = parseISO(endDate);
        const cutoff = new Date(end);
        cutoff.setDate(cutoff.getDate() - 6);
        const cutoffStr = format(cutoff, 'yyyy-MM-dd');
        const recentUnits = txnsAll
            .filter(r => r.date >= cutoffStr)
            .reduce((s, r) => s + (Number(r.uds) || 0), 0);
        return recentUnits / 7;
    }, [txnsAll, endDate]);

    if (!product) return null;

    const unitsLastN = txnsAll.reduce((s, r) => s + (Number(r.uds) || 0), 0);
    const revenueLastN = txnsAll.reduce((s, r) => s + (Number(r.importe) || 0), 0);
    const stockCritical = product.daysOfStock != null && product.daysOfStock <= LOW_STOCK_DAYS;
    const stockWarn = product.daysOfStock != null && product.daysOfStock > LOW_STOCK_DAYS && product.daysOfStock <= WARN_STOCK_DAYS;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl my-8 relative">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4 sticky top-0 bg-white rounded-t-xl z-10">
                    <div>
                        <h2 className="text-xl font-serif text-primary">{product.descripcion_raw}</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            {product.departamento || '—'} · {product.seccion || '—'} · {product.marca_mapeada || '—'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Revenue ({windowDays}d)</div>
                            <div className="text-xl font-semibold text-primary mt-1">{formatCurrency(revenueLastN)}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Units ({windowDays}d)</div>
                            <div className="text-xl font-semibold text-primary mt-1">{formatNumber(unitsLastN)}</div>
                            <div className="text-[10px] text-gray-500 mt-1">{(unitsLastN / windowDays).toFixed(2)} /día</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Últimos 7d</div>
                            <div className="text-xl font-semibold text-primary mt-1">{recent7dVelocity.toFixed(2)}<span className="text-xs ml-1 font-normal">/día</span></div>
                            <div className="text-[10px] text-gray-500 mt-1">
                                {product.velocity > 0 && (
                                    <>vs. {product.velocity.toFixed(2)}/día medio · {recent7dVelocity > product.velocity ? '↑' : '↓'} {Math.abs(((recent7dVelocity - product.velocity) / product.velocity) * 100).toFixed(0)}%</>
                                )}
                            </div>
                        </div>
                        <div className={clsx(
                            'rounded-lg p-4',
                            stockCritical ? 'bg-red-50 border border-red-200'
                            : stockWarn ? 'bg-amber-50 border border-amber-200'
                            : 'bg-gray-50'
                        )}>
                            <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold inline-flex items-center gap-1">
                                <Package className="w-3 h-3" /> Stock
                            </div>
                            {product.hasInventory ? (
                                <>
                                    <div className="text-xl font-semibold mt-1">{formatNumber(product.stockUnits)} uds</div>
                                    <div className="text-[10px] text-gray-600 mt-1">
                                        {product.daysOfStock != null
                                            ? <>~{product.daysOfStock.toFixed(1)} días a velocidad pública</>
                                            : <>sin velocidad pública → stock indefinido</>}
                                        {product.stockValue != null && <> · {formatCurrency(product.stockValue)}</>}
                                    </div>
                                </>
                            ) : (
                                <div className="text-sm text-gray-500 mt-1 italic">Sin datos de inventario para este SKU.</div>
                            )}
                        </div>
                    </div>

                    {/* Public vs named alert */}
                    {product.namedShare > 50 && (
                        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <div>
                                <strong>Consumo interno dominante.</strong> El {(100 - product.publicShare).toFixed(0)}% de la venta viene de clientes nombrados
                                {product.topNamedClient ? <> — principalmente <strong>{product.topNamedClient}</strong> ({product.topNamedClientShare.toFixed(0)}% del revenue).</> : '.'}
                                {' '}Ajusta la reposición en base a la velocidad pública ({product.publicVelocity.toFixed(2)} uds/día).
                            </div>
                        </div>
                    )}

                    {/* Daily trend */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-serif text-primary mb-3">Ventas diarias</h3>
                        <div className="h-[240px]">
                            <Line
                                data={{
                                    labels: dailySeries.labels,
                                    datasets: [
                                        { label: 'Units', data: dailySeries.units, borderColor: '#D9825F', backgroundColor: 'rgba(217,130,95,0.12)', fill: true, tension: 0.3, pointRadius: 0 },
                                    ],
                                }}
                                options={{
                                    maintainAspectRatio: false,
                                    plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${formatNumber(ctx.parsed.y)} uds` } } },
                                    scales: {
                                        x: { ticks: { autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
                                        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                                    },
                                }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Hour-of-day */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <h3 className="text-sm font-serif text-primary mb-3">Hora del día</h3>
                            <div className="h-[220px]">
                                <Bar
                                    data={{
                                        labels: hourly.labels,
                                        datasets: [{ label: 'Units', data: hourly.units, backgroundColor: '#6E8C71' }],
                                    }}
                                    options={{
                                        maintainAspectRatio: false,
                                        plugins: { legend: { display: false }, datalabels: { display: false } },
                                        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } } },
                                    }}
                                />
                            </div>
                        </div>

                        {/* Client breakdown */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <h3 className="text-sm font-serif text-primary mb-3">Clientes</h3>
                            <div className="overflow-y-auto max-h-[220px]">
                                <table className="w-full text-sm">
                                    <thead className="text-[10px] uppercase text-gray-500 tracking-wider">
                                        <tr>
                                            <th className="text-left py-1.5">Cliente</th>
                                            <th className="text-right">Uds</th>
                                            <th className="text-right">Revenue</th>
                                            <th className="text-right">% Rev</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {clientBreakdown.slice(0, 10).map(c => (
                                            <tr key={c.cliente}>
                                                <td className="py-1.5 truncate max-w-[180px]" title={c.cliente}>{c.cliente}</td>
                                                <td className="text-right tabular-nums">{formatNumber(c.units)}</td>
                                                <td className="text-right tabular-nums">{formatCurrency(c.revenue)}</td>
                                                <td className="text-right tabular-nums text-gray-500">{c.share.toFixed(0)}%</td>
                                            </tr>
                                        ))}
                                        {clientBreakdown.length === 0 && (
                                            <tr><td colSpan={4} className="py-4 text-center text-gray-400 italic">Sin transacciones.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                                {clientBreakdown.length > 10 && (
                                    <p className="text-[10px] text-gray-400 mt-2">+{clientBreakdown.length - 10} clientes más</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PicadeliProductModal;
