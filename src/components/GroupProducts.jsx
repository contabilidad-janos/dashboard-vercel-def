import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { DataService } from '../services/dataService';
import { format, subDays, startOfYear, parseISO, differenceInCalendarDays } from 'date-fns';

// Article-level "best sellers" for BUs that only exist in group_article_sales
// (Juntos house, Juntos boutique). Self-contained: no client/origen/marca
// granularity like Can Escarrer — those BUs sell mostly to "Clientes varios",
// so this focuses on what the data supports well: product ranking, € vs units,
// and the monthly trend since 2024. Revenue is NET (sin IVA).

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const eur = (n) => '€' + Math.round(Number(n) || 0).toLocaleString('es-ES');
const eur2 = (n) => '€' + (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ns = (n) => Math.round(Number(n) || 0).toLocaleString('es-ES');
const today = () => format(new Date(), 'yyyy-MM-dd');
const BU_UNIT = { 'Juntos house': 'pax', 'Juntos boutique': 'tickets' };

const monthsBetween = (start, end) => {
    const out = [];
    let d = new Date(start.slice(0, 7) + '-01T00:00:00');
    const last = end.slice(0, 7);
    for (let i = 0; i < 400; i++) {
        const ym = format(d, 'yyyy-MM');
        out.push(ym);
        if (ym === last) break;
        d.setMonth(d.getMonth() + 1);
    }
    return out;
};

const Sparkline = ({ series, months, color = '#9dbf9a' }) => {
    const vals = months.map(m => series[m] || 0);
    const max = Math.max(1, ...vals);
    const w = 108, h = 24, n = vals.length || 1, bw = (w - 2) / n;
    return (
        <svg width={w} height={h} className="block">
            {vals.map((v, i) => {
                const bh = Math.round((h - 3) * v / max);
                return <rect key={i} x={1 + i * bw} y={h - bh} width={Math.max(bw - 0.6, 0.8)} height={bh} rx={0.5} fill={color} />;
            })}
        </svg>
    );
};

const MonthlyChart = ({ months, totals, metric }) => {
    const vals = months.map(m => (totals[m] ? (metric === 'rev' ? totals[m].rev : totals[m].uds) : 0));
    const max = Math.max(1, ...vals);
    const n = months.length;
    const bw = Math.max(14, Math.min(48, Math.floor(820 / Math.max(n, 1)) - 6));
    const gap = 6, padL = 6, padB = 30, padT = 16, H = 180;
    const W = Math.max(760, padL * 2 + n * (bw + gap));
    const plotH = H - padB - padT;
    return (
        <div className="overflow-x-auto">
            <svg width={W} height={H} className="block">
                <line x1={padL} x2={W - padL} y1={H - padB} y2={H - padB} stroke="#e5e7eb" strokeWidth="1" />
                {months.map((m, i) => {
                    const v = vals[i];
                    const bh = Math.round(plotH * v / max);
                    const x = padL + i * (bw + gap);
                    const y = H - padB - bh;
                    const mo = parseInt(m.slice(5), 10) - 1;
                    const yy = m.slice(2, 4);
                    const showY = mo === 0 || i === 0;
                    return (
                        <g key={m}>
                            <title>{`${MES[mo]} '${yy}: ${metric === 'rev' ? eur(v) : ns(v) + ' ud'}`}</title>
                            <rect x={x} y={y} width={bw} height={Math.max(bh, v > 0 ? 2 : 0)} rx={3} fill="#5f8a63" />
                            {bh > 24 && (
                                <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#8a9086">
                                    {metric === 'rev' ? '€' + Math.round(v / 1000) + 'k' : ns(v)}
                                </text>
                            )}
                            {(bw >= 22 || mo % 2 === 0) && (
                                <text x={x + bw / 2} y={H - padB + 13} textAnchor="middle" fontSize="10" fill="#8a9086">{MES[mo]}</text>
                            )}
                            {showY && (bw >= 22 || mo % 2 === 0) && (
                                <text x={x + bw / 2} y={H - padB + 24} textAnchor="middle" fontSize="10" fontWeight="600" fill="#8a9086">{"'" + yy}</text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

const GroupProducts = ({ bu }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [rows, setRows] = useState([]);
    const [deps, setDeps] = useState([]);
    const [dateBounds, setDateBounds] = useState({ min: null, max: null });

    const [startDate, setStartDate] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(today());
    const [selectedDeps, setSelectedDeps] = useState([]);
    const [search, setSearch] = useState('');
    const [metric, setMetric] = useState('rev');
    const [expanded, setExpanded] = useState(null);

    // options + bounds per BU
    useEffect(() => {
        let cancelled = false;
        setSelectedDeps([]); setSearch(''); setExpanded(null);
        (async () => {
            try {
                const [opts, bounds] = await Promise.all([
                    DataService.getGroupArticleFilterOptions(bu),
                    DataService.getGroupArticleDateBounds(bu),
                ]);
                if (cancelled) return;
                setDeps(opts.departamentos || []);
                setDateBounds(bounds);
            } catch (e) { if (!cancelled) setError(e.message || String(e)); }
        })();
        return () => { cancelled = true; };
    }, [bu]);

    // rows
    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        (async () => {
            try {
                const data = await DataService.getGroupArticleRaw(bu, startDate, endDate);
                if (!cancelled) setRows(data || []);
            } catch (e) { if (!cancelled) setError(e.message || String(e)); }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [bu, startDate, endDate]);

    const applyPreset = (p) => {
        const now = new Date();
        const end = format(now, 'yyyy-MM-dd');
        if (p === 'ytd') { setStartDate(format(startOfYear(now), 'yyyy-MM-dd')); setEndDate(end); }
        else if (p === '90d') { setStartDate(format(subDays(now, 90), 'yyyy-MM-dd')); setEndDate(end); }
        else if (p === '2024') { setStartDate('2024-01-01'); setEndDate('2024-12-31'); }
        else if (p === '2025') { setStartDate('2025-01-01'); setEndDate('2025-12-31'); }
        else if (p === '2026') { setStartDate('2026-01-01'); setEndDate(end); }
        else if (p === 'all' && dateBounds.min) { setStartDate(dateBounds.min); setEndDate(dateBounds.max || end); }
    };

    const toggleDep = (d) => setSelectedDeps(s => s.includes(d) ? s.filter(x => x !== d) : [...s, d]);

    const months = useMemo(() => monthsBetween(startDate, endDate), [startDate, endDate]);

    const filtered = useMemo(() => {
        const s = search.trim().toUpperCase();
        const dep = new Set(selectedDeps);
        return rows.filter(r => {
            if (dep.size && !dep.has(r.departamento)) return false;
            if (s && !((r.descripcion || '').includes(s))) return false;
            return true;
        });
    }, [rows, selectedDeps, search]);

    const { products, totals, monthlyTotals } = useMemo(() => {
        const map = new Map();
        const mTot = {};
        filtered.forEach(r => {
            const key = r.descripcion;
            const ym = (r.date || '').slice(0, 7);
            const uds = Number(r.uds) || 0;
            const imp = Number(r.importe) || 0;
            if (ym) { (mTot[ym] = mTot[ym] || { rev: 0, uds: 0 }); mTot[ym].rev += imp; mTot[ym].uds += uds; }
            if (!key) return;
            let a = map.get(key);
            if (!a) { a = { descripcion: key, name: r.descripcion_raw || key, dep: r.departamento || '', uds: 0, rev: 0, monthly: {}, last: null }; map.set(key, a); }
            a.uds += uds; a.rev += imp;
            if (ym) { a.monthly[ym] = (a.monthly[ym] || 0) + imp; }
            if (r.date && (!a.last || r.date > a.last)) a.last = r.date;
        });
        const list = [...map.values()];
        const totRev = list.reduce((s, p) => s + p.rev, 0);
        const totUds = list.reduce((s, p) => s + p.uds, 0);
        list.forEach(p => { p.pct = totRev > 0 ? (p.rev / totRev) * 100 : 0; p.avg = p.uds > 0 ? p.rev / p.uds : 0; });
        return { products: list, totals: { rev: totRev, uds: totUds, n: list.length }, monthlyTotals: mTot };
    }, [filtered]);

    const sorted = useMemo(() => {
        const arr = products.filter(p => (p.rev > 0 || p.uds > 0));
        arr.sort((a, b) => (metric === 'rev' ? b.rev - a.rev : b.uds - a.uds));
        return arr;
    }, [products, metric]);

    const top = sorted[0];
    const unit = BU_UNIT[bu] || '';

    const Pill = ({ active, onClick, children }) => (
        <button onClick={onClick} className={clsx('px-3 py-1 text-xs font-semibold rounded-full border transition-all',
            active ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-accent hover:text-accent')}>{children}</button>
    );

    return (
        <div>
            <div className="mb-5">
                <h2 className="text-3xl md:text-4xl font-serif text-primary">Best Selling Products — {bu}</h2>
                <p className="text-sm text-gray-500 mt-1">Ranking de artículos por ventas netas (sin IVA) y evolución mensual desde 2024. Fuente: ICG.</p>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Periodo</span>
                    <Pill active={false} onClick={() => applyPreset('90d')}>90 días</Pill>
                    <Pill active={startDate === format(startOfYear(new Date()), 'yyyy-MM-dd')} onClick={() => applyPreset('ytd')}>2026 YTD</Pill>
                    <Pill active={startDate === '2025-01-01' && endDate === '2025-12-31'} onClick={() => applyPreset('2025')}>2025</Pill>
                    <Pill active={startDate === '2024-01-01' && endDate === '2024-12-31'} onClick={() => applyPreset('2024')}>2024</Pill>
                    <Pill active={dateBounds.min && startDate === dateBounds.min} onClick={() => applyPreset('all')}>Todo</Pill>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ordenar</span>
                    <div className="inline-flex rounded-full border border-gray-200 overflow-hidden">
                        <button onClick={() => setMetric('rev')} className={clsx('px-3 py-1 text-xs font-semibold', metric === 'rev' ? 'bg-accent/10 text-accent' : 'bg-white text-gray-500')}>€ neto</button>
                        <button onClick={() => setMetric('uds')} className={clsx('px-3 py-1 text-xs font-semibold border-l border-gray-200', metric === 'uds' ? 'bg-accent/10 text-accent' : 'bg-white text-gray-500')}>Unidades</button>
                    </div>
                </div>
                <div className="flex-1 min-w-[160px]">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar artículo…"
                        className="w-full px-3 py-1.5 text-sm rounded-full border border-gray-200 focus:border-accent focus:outline-none" />
                </div>
            </div>

            {/* Departamento chips */}
            {deps.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Depto</span>
                    <Pill active={selectedDeps.length === 0} onClick={() => setSelectedDeps([])}>Todos</Pill>
                    {deps.map(d => <Pill key={d} active={selectedDeps.includes(d)} onClick={() => toggleDep(d)}>{d}</Pill>)}
                </div>
            )}

            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">{error}</div>}

            {loading ? (
                <div className="text-center text-gray-400 italic py-12">Cargando artículos de {bu}…</div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {[
                            { l: 'Ventas netas', v: eur(totals.rev), h: `${products.length ? sorted.length : 0} artículos` },
                            { l: unit === 'pax' ? 'Cubiertos / uds' : 'Unidades', v: ns(totals.uds), h: unit },
                            { l: 'Precio medio', v: eur2(totals.uds > 0 ? totals.rev / totals.uds : 0), h: 'por unidad' },
                            { l: 'Top artículo', v: <span className="text-lg leading-tight">{top ? top.name : '—'}</span>, h: top ? `${eur(top.rev)} · ${ns(top.uds)} ud` : '' },
                        ].map((k, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{k.l}</div>
                                <div className="text-2xl font-bold text-primary tabular-nums leading-tight">{k.v}</div>
                                {k.h && <div className="text-xs text-gray-400 mt-1 truncate">{k.h}</div>}
                            </div>
                        ))}
                    </div>

                    {/* Monthly trend */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
                        <div className="flex items-baseline justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700">Ventas por mes</h3>
                            <span className="text-[11px] text-gray-400">{metric === 'rev' ? 'importe neto' : 'unidades'}</span>
                        </div>
                        <MonthlyChart months={months} totals={monthlyTotals} metric={metric} />
                    </div>

                    {/* Top products table */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-baseline justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700">Top artículos</h3>
                            <span className="text-[11px] text-gray-400">clic en una fila para ver el detalle por mes</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[10.5px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                        <th className="text-left font-semibold py-2 pr-2 w-8">#</th>
                                        <th className="text-left font-semibold py-2 pr-2">Artículo</th>
                                        <th className="text-right font-semibold py-2 px-2">Unidades</th>
                                        <th className="text-right font-semibold py-2 px-2">€ neto</th>
                                        <th className="text-right font-semibold py-2 px-2">€/ud</th>
                                        <th className="text-right font-semibold py-2 px-2">% ventas</th>
                                        <th className="text-left font-semibold py-2 pl-2">Tendencia</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.slice(0, 40).map((p, i) => (
                                        <React.Fragment key={p.descripcion}>
                                            <tr onClick={() => setExpanded(expanded === p.descripcion ? null : p.descripcion)}
                                                className="border-b border-gray-50 hover:bg-accent/5 cursor-pointer">
                                                <td className="py-2 pr-2 text-gray-400 tabular-nums">{i + 1}</td>
                                                <td className="py-2 pr-2">
                                                    <span className="font-medium text-gray-800">{p.name}</span>
                                                    {p.dep && <span className="ml-2 inline-block text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{p.dep}</span>}
                                                </td>
                                                <td className="py-2 px-2 text-right tabular-nums text-gray-600">{ns(p.uds)}</td>
                                                <td className="py-2 px-2 text-right tabular-nums font-semibold text-gray-800">{eur(p.rev)}</td>
                                                <td className="py-2 px-2 text-right tabular-nums text-gray-600">{eur2(p.avg)}</td>
                                                <td className="py-2 px-2 text-right tabular-nums text-gray-500">{p.pct.toFixed(1)}%</td>
                                                <td className="py-2 pl-2"><Sparkline series={p.monthly} months={months} /></td>
                                            </tr>
                                            {expanded === p.descripcion && (
                                                <tr className="bg-accent/5">
                                                    <td colSpan={7} className="px-3 py-3">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {months.filter(m => p.monthly[m]).length === 0 && <span className="text-xs text-gray-400">Sin ventas en el periodo.</span>}
                                                            {months.filter(m => p.monthly[m]).map(m => {
                                                                const mo = parseInt(m.slice(5), 10) - 1;
                                                                return (
                                                                    <span key={m} className="text-[11px] tabular-nums bg-white border border-gray-200 rounded px-2 py-1 text-gray-600">
                                                                        {MES[mo]} '{m.slice(2, 4)} <b className="text-gray-800">{eur(p.monthly[m])}</b>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                    {sorted.length === 0 && (
                                        <tr><td colSpan={7} className="text-center text-gray-400 italic py-8">Sin datos para este filtro.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-3">Importe = ventas netas sin IVA (base imponible ICG). Las devoluciones se descuentan. Mostrando top 40 por {metric === 'rev' ? '€' : 'unidades'}.</p>
                    </div>
                </>
            )}
        </div>
    );
};

export default GroupProducts;
