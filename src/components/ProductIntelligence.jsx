import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Scatter, Line, Bar } from 'react-chartjs-2';
import { DataService } from '../services/dataService';

// Group-wide, article-level "Product Intelligence" built on the
// pi_product_bu_year materialized view (net/sin IVA, 2024→today). Five lenses:
//   cross   — cross-channel demand (same product across all BUs)
//   pareto  — ABC / 80-20 per BU
//   menu    — menu engineering scatter (popularity vs price)
//   season  — per-product seasonality (plan production)
//   price   — realized price consistency across channels
// Seasonality drills via pi_product_monthly (per-product, on demand).

const eur = (n) => '€' + Math.round(Number(n) || 0).toLocaleString('es-ES');
const eur2 = (n) => '€' + (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ns = (n) => Math.round(Number(n) || 0).toLocaleString('es-ES');
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const BU_LABEL = { 'Picadeli': 'Juntos deli', 'Juntos house': 'Juntos house', 'Juntos boutique': 'Boutique', 'Juntos farm shop': 'Farm shop', 'Tasting place': 'Tasting', 'Distribution b2b': 'Distribución', 'Juntos Products': 'Products' };
const BU_COLOR = { 'Juntos house': '#4b7a52', 'Picadeli': '#2a78d6', 'Tasting place': '#eda100', 'Juntos farm shop': '#1baf7a', 'Distribution b2b': '#eb6834', 'Juntos boutique': '#e87ba4', 'Juntos Products': '#4a3aa7' };
const BU_ORDER = ['Juntos house', 'Picadeli', 'Tasting place', 'Juntos farm shop', 'Distribution b2b', 'Juntos boutique', 'Juntos Products'];

const VIEWS = [
    { id: 'cross', label: 'Cross-canal', hint: 'Demanda total de un producto por todos los canales' },
    { id: 'pareto', label: 'Pareto / ABC', hint: 'El 20% de artículos que hacen el 80%' },
    { id: 'menu', label: 'Ingeniería de carta', hint: 'Popularidad vs precio' },
    { id: 'season', label: 'Estacionalidad', hint: 'Cuándo pica cada producto' },
    { id: 'price', label: 'Precios', hint: 'Consistencia de precio entre canales' },
];

const Card = ({ children, className }) => <div className={clsx('bg-white rounded-2xl border border-gray-100 shadow-sm', className)}>{children}</div>;
const Pill = ({ active, onClick, children }) => (
    <button onClick={onClick} className={clsx('px-3 py-1 text-xs font-semibold rounded-full border transition-all',
        active ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-accent hover:text-accent')}>{children}</button>
);
const ChannelBar = ({ channels }) => {
    const total = [...channels.values()].reduce((s, c) => s + c.rev, 0) || 1;
    const parts = BU_ORDER.filter(bu => channels.has(bu)).map(bu => ({ bu, rev: channels.get(bu).rev }));
    return (
        <div className="flex h-3 w-28 rounded-full overflow-hidden bg-gray-100" title={parts.map(p => `${BU_LABEL[p.bu]}: ${eur(p.rev)}`).join('  ·  ')}>
            {parts.map(p => <div key={p.bu} style={{ width: `${(p.rev / total) * 100}%`, background: BU_COLOR[p.bu] }} />)}
        </div>
    );
};

const ProductIntelligence = () => {
    const [mv, setMv] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [view, setView] = useState('cross');
    const [year, setYear] = useState('all');
    const [bu, setBu] = useState('Juntos house');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);          // product for cross drill
    const [seasonProduct, setSeasonProduct] = useState(null);
    const [monthly, setMonthly] = useState(null);            // cross drill monthly
    const [seasonData, setSeasonData] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const rows = await DataService.getPiProductBuYear();
                if (!cancelled) { setMv(rows); setLoading(false); }
            } catch (e) { if (!cancelled) { setError(e.message || String(e)); setLoading(false); } }
        })();
        return () => { cancelled = true; };
    }, []);

    const years = useMemo(() => [...new Set(mv.map(r => r.yr))].sort(), [mv]);

    // aggregate for the selected year
    const { products, byBu, buList } = useMemo(() => {
        const rows = year === 'all' ? mv : mv.filter(r => r.yr === Number(year));
        const products = new Map();   // desc -> {name,dept, uds, rev, channels: Map(bu->{uds,rev})}
        const byBu = new Map();       // bu -> Map(desc -> {name,dept,uds,rev})
        rows.forEach(r => {
            const uds = Number(r.uds) || 0, rev = Number(r.rev) || 0;
            let p = products.get(r.descripcion);
            if (!p) { p = { descripcion: r.descripcion, name: r.name || r.descripcion, dept: r.dept || '', uds: 0, rev: 0, channels: new Map() }; products.set(r.descripcion, p); }
            p.uds += uds; p.rev += rev;
            const ch = p.channels.get(r.bu) || { uds: 0, rev: 0 };
            ch.uds += uds; ch.rev += rev; p.channels.set(r.bu, ch);
            let b = byBu.get(r.bu);
            if (!b) { b = new Map(); byBu.set(r.bu, b); }
            let bp = b.get(r.descripcion);
            if (!bp) { bp = { descripcion: r.descripcion, name: r.name || r.descripcion, dept: r.dept || '', uds: 0, rev: 0 }; b.set(r.descripcion, bp); }
            bp.uds += uds; bp.rev += rev;
        });
        const buList = BU_ORDER.filter(b => byBu.has(b));
        return { products, byBu, buList };
    }, [mv, year]);

    // cross drill fetch
    useEffect(() => {
        if (view !== 'cross' || !selected) { setMonthly(null); return; }
        let cancelled = false;
        setMonthly('loading');
        (async () => {
            const d = await DataService.getPiProductMonthly(selected);
            if (!cancelled) setMonthly(d);
        })();
        return () => { cancelled = true; };
    }, [view, selected]);

    // seasonality fetch
    useEffect(() => {
        if (view !== 'season') return;
        const prod = seasonProduct || [...products.values()].sort((a, b) => b.rev - a.rev)[0]?.descripcion;
        if (!prod) return;
        if (!seasonProduct) setSeasonProduct(prod);
        let cancelled = false;
        setSeasonData('loading');
        (async () => {
            const d = await DataService.getPiProductMonthly(prod);
            if (!cancelled) setSeasonData(d);
        })();
        return () => { cancelled = true; };
    }, [view, seasonProduct, products]);

    if (loading) return <div className="text-center text-gray-400 italic py-16">Cargando inteligencia de producto…</div>;
    if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>;

    const activeView = VIEWS.find(v => v.id === view);

    return (
        <div className="animate-in fade-in duration-500">
            <div className="mb-5">
                <h2 className="text-3xl md:text-4xl font-serif text-primary">Product Intelligence</h2>
                <p className="text-sm text-gray-500 mt-1">Análisis a nivel de artículo de todo el grupo (ventas netas, sin IVA, desde 2024). {activeView?.hint}.</p>
            </div>

            {/* view tabs + year */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div className="flex flex-wrap gap-2">
                    {VIEWS.map(v => (
                        <button key={v.id} onClick={() => setView(v.id)}
                            className={clsx('px-4 py-1.5 text-sm font-medium rounded-full border transition-all',
                                view === v.id ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-accent hover:text-accent')}>
                            {v.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Año</span>
                    <Pill active={year === 'all'} onClick={() => setYear('all')}>Todos</Pill>
                    {years.map(y => <Pill key={y} active={year === y} onClick={() => setYear(y)}>{y}</Pill>)}
                </div>
            </div>

            {view === 'cross' && <CrossChannel products={products} search={search} setSearch={setSearch} selected={selected} setSelected={setSelected} monthly={monthly} />}
            {view === 'pareto' && <Pareto byBu={byBu} products={products} buList={buList} bu={bu} setBu={setBu} />}
            {view === 'menu' && <MenuEngineering byBu={byBu} products={products} buList={buList} bu={bu} setBu={setBu} />}
            {view === 'season' && <Seasonality products={products} seasonProduct={seasonProduct} setSeasonProduct={setSeasonProduct} data={seasonData} search={search} setSearch={setSearch} />}
            {view === 'price' && <PriceConsistency products={products} search={search} setSearch={setSearch} />}
        </div>
    );
};

/* ─────────────── #1 Cross-channel ─────────────── */
const CrossChannel = ({ products, search, setSearch, selected, setSelected, monthly }) => {
    const list = useMemo(() => {
        const s = search.trim().toUpperCase();
        return [...products.values()]
            .filter(p => !s || p.descripcion.includes(s))
            .sort((a, b) => b.rev - a.rev)
            .slice(0, 60);
    }, [products, search]);
    const sel = selected ? products.get(selected) : null;

    const monthlyLine = useMemo(() => {
        if (!Array.isArray(monthly)) return null;
        const byYm = {};
        monthly.forEach(m => { byYm[m.ym] = (byYm[m.ym] || 0) + (Number(m.rev) || 0); });
        const yms = Object.keys(byYm).sort();
        return {
            labels: yms.map(m => MES[+m.slice(5) - 1] + " '" + m.slice(2, 4)),
            datasets: [{ label: 'Ventas netas', data: yms.map(m => byYm[m]), borderColor: '#4b7a52', backgroundColor: 'rgba(75,122,82,0.12)', fill: true, tension: 0.3, pointRadius: 2 }],
        };
    }, [monthly]);

    return (
        <div className="grid lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-3 p-5">
                <div className="flex items-baseline justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Productos del grupo · demanda por canal</h3>
                    <input value={search} onChange={e => { setSearch(e.target.value); }} placeholder="Buscar…" className="px-3 py-1 text-sm rounded-full border border-gray-200 focus:border-accent focus:outline-none w-40" />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr className="text-[10.5px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                            <th className="text-left font-semibold py-2 pr-2">Artículo</th>
                            <th className="text-right font-semibold py-2 px-2">€ neto</th>
                            <th className="text-right font-semibold py-2 px-2">Uds</th>
                            <th className="text-center font-semibold py-2 px-2">Canales</th>
                            <th className="text-left font-semibold py-2 pl-2">Mix</th>
                        </tr></thead>
                        <tbody>
                            {list.map(p => (
                                <tr key={p.descripcion} onClick={() => setSelected(p.descripcion)}
                                    className={clsx('border-b border-gray-50 cursor-pointer hover:bg-accent/5', selected === p.descripcion && 'bg-accent/10')}>
                                    <td className="py-2 pr-2"><span className="font-medium text-gray-800">{p.name}</span>{p.dept && <span className="ml-2 text-[10px] text-gray-400">{p.dept}</span>}</td>
                                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-gray-800">{eur(p.rev)}</td>
                                    <td className="py-2 px-2 text-right tabular-nums text-gray-600">{ns(p.uds)}</td>
                                    <td className="py-2 px-2 text-center tabular-nums">
                                        <span className={clsx('inline-block text-[11px] font-semibold rounded-full px-2 py-0.5', p.channels.size >= 3 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500')}>{p.channels.size}</span>
                                    </td>
                                    <td className="py-2 pl-2"><ChannelBar channels={p.channels} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-[11px] text-gray-400 mt-3">Los productos en 3+ canales (badge verde) son los que atraviesan el grupo — clave para planificar producción. Clic para ver el detalle.</p>
            </Card>

            <Card className="lg:col-span-2 p-5">
                {!sel ? (
                    <div className="text-center text-gray-400 italic py-16">Selecciona un artículo para ver su demanda total y por canal.</div>
                ) : (
                    <div>
                        <h3 className="text-base font-semibold text-gray-800">{sel.name}</h3>
                        <p className="text-xs text-gray-400 mb-3">{sel.dept} · demanda total del grupo</p>
                        <div className="flex gap-4 mb-4">
                            <div><div className="text-2xl font-bold text-primary tabular-nums">{eur(sel.rev)}</div><div className="text-[11px] text-gray-400 uppercase">ventas netas</div></div>
                            <div><div className="text-2xl font-bold text-primary tabular-nums">{ns(sel.uds)}</div><div className="text-[11px] text-gray-400 uppercase">unidades</div></div>
                            <div><div className="text-2xl font-bold text-primary tabular-nums">{sel.channels.size}</div><div className="text-[11px] text-gray-400 uppercase">canales</div></div>
                        </div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Por canal</div>
                        <div className="space-y-1.5 mb-4">
                            {BU_ORDER.filter(b => sel.channels.has(b)).sort((a, b) => sel.channels.get(b).rev - sel.channels.get(a).rev).map(b => {
                                const c = sel.channels.get(b); const pct = (c.rev / sel.rev) * 100;
                                return (
                                    <div key={b} className="flex items-center gap-2 text-xs">
                                        <span className="w-24 truncate text-gray-600">{BU_LABEL[b]}</span>
                                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div style={{ width: `${pct}%`, background: BU_COLOR[b] }} className="h-full" /></div>
                                        <span className="w-16 text-right tabular-nums text-gray-700 font-medium">{eur(c.rev)}</span>
                                        <span className="w-16 text-right tabular-nums text-gray-500">{ns(c.uds)} ud</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Evolución mensual (grupo)</div>
                        <div className="h-40">
                            {monthly === 'loading' ? <div className="text-center text-gray-400 italic py-12 text-sm">Cargando…</div>
                                : monthlyLine ? <Line data={monthlyLine} options={lineOpts} /> : <div className="text-gray-400 text-sm py-12 text-center">Sin datos.</div>}
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};

/* ─────────────── #3 Pareto / ABC ─────────────── */
const Pareto = ({ byBu, products, buList, bu, setBu }) => {
    const source = bu === 'ALL' ? [...products.values()] : (byBu.has(bu) ? [...byBu.get(bu).values()] : []);
    const sorted = useMemo(() => source.slice().sort((a, b) => b.rev - a.rev).filter(p => p.rev > 0), [source]);
    const total = sorted.reduce((s, p) => s + p.rev, 0) || 1;
    let cum = 0;
    const withCum = sorted.map(p => { cum += p.rev; return { ...p, cumPct: (cum / total) * 100 }; });
    const a80 = withCum.filter(p => p.cumPct <= 80).length || 1;
    const b95 = withCum.filter(p => p.cumPct > 80 && p.cumPct <= 95).length;
    const cRest = withCum.length - a80 - b95;

    const chart = {
        labels: withCum.map((_, i) => i + 1),
        datasets: [{ label: '% acumulado de ventas', data: withCum.map(p => p.cumPct), borderColor: '#4b7a52', backgroundColor: 'rgba(75,122,82,0.10)', fill: true, tension: 0.2, pointRadius: 0, borderWidth: 2 }],
    };
    const opts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { title: (t) => `Artículo #${t[0].label}`, label: (t) => `${t.raw.toFixed(1)}% acumulado` } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#f0f0ec' } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } } },
    };

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Centro</span>
                <Pill active={bu === 'ALL'} onClick={() => setBu('ALL')}>Todo el grupo</Pill>
                {buList.map(b => <Pill key={b} active={bu === b} onClick={() => setBu(b)}>{BU_LABEL[b]}</Pill>)}
            </div>
            <div className="grid lg:grid-cols-3 gap-4 mb-6">
                {[
                    { l: 'Clase A', v: a80, h: `${((a80 / withCum.length) * 100 || 0).toFixed(0)}% de los SKU → 80% de ventas`, c: 'text-primary' },
                    { l: 'Clase B', v: b95, h: 'siguiente 15% de ventas', c: 'text-gray-700' },
                    { l: 'Clase C (cola larga)', v: cRest, h: 'último 5% de ventas — candidatos a revisar/retirar', c: 'text-gray-400' },
                ].map((k, i) => (
                    <Card key={i} className="p-4">
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{k.l}</div>
                        <div className={clsx('text-3xl font-bold tabular-nums', k.c)}>{k.v} <span className="text-sm font-medium text-gray-400">artículos</span></div>
                        <div className="text-xs text-gray-400 mt-1">{k.h}</div>
                    </Card>
                ))}
            </div>
            <Card className="p-5 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Curva de Pareto</h3>
                <p className="text-[11px] text-gray-400 mb-3">Eje X: artículos ordenados de más a menos ventas · Eje Y: % acumulado. Cuanto antes llega al 80%, más concentrada está la facturación.</p>
                <div className="h-64"><Line data={chart} options={opts} /></div>
            </Card>
            <Card className="p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Clase A — los que mandan</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr className="text-[10.5px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                            <th className="text-left font-semibold py-2 pr-2 w-8">#</th><th className="text-left font-semibold py-2 pr-2">Artículo</th>
                            <th className="text-right font-semibold py-2 px-2">€ neto</th><th className="text-right font-semibold py-2 px-2">% ventas</th><th className="text-right font-semibold py-2 px-2">% acum.</th>
                        </tr></thead>
                        <tbody>
                            {withCum.slice(0, a80).slice(0, 30).map((p, i) => (
                                <tr key={p.descripcion} className="border-b border-gray-50">
                                    <td className="py-1.5 pr-2 text-gray-400 tabular-nums">{i + 1}</td>
                                    <td className="py-1.5 pr-2 font-medium text-gray-800">{p.name}{p.dept && <span className="ml-2 text-[10px] text-gray-400">{p.dept}</span>}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-gray-800">{eur(p.rev)}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{((p.rev / total) * 100).toFixed(1)}%</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums text-primary">{p.cumPct.toFixed(1)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {a80 > 30 && <p className="text-[11px] text-gray-400 mt-2">… y {a80 - 30} artículos más en Clase A.</p>}
                </div>
            </Card>
        </div>
    );
};

/* ─────────────── #4 Menu engineering ─────────────── */
const MenuEngineering = ({ byBu, products, buList, bu, setBu }) => {
    const source = bu === 'ALL' ? [...products.values()] : (byBu.has(bu) ? [...byBu.get(bu).values()] : []);
    const items = useMemo(() => source.map(p => ({ ...p, avg: p.uds > 0 ? p.rev / p.uds : 0 })).filter(p => p.uds > 0 && p.avg > 0), [source]);
    // medians
    const med = (arr) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const top = items.slice().sort((a, b) => b.rev - a.rev).slice(0, 80);
    const medU = med(top.map(p => p.uds));
    const medP = med(top.map(p => p.avg));
    const quad = (p) => p.uds >= medU ? (p.avg >= medP ? 'star' : 'horse') : (p.avg >= medP ? 'puzzle' : 'dog');
    const QC = { star: '#1baf7a', horse: '#2a78d6', puzzle: '#eda100', dog: '#c0392b' };
    const maxRev = Math.max(1, ...top.map(p => p.rev));

    const data = {
        datasets: [
            { label: 'Estrellas', data: top.filter(p => quad(p) === 'star').map(p => ({ x: p.uds, y: p.avg, name: p.name, rev: p.rev })), backgroundColor: QC.star },
            { label: 'Caballos (popular, barato)', data: top.filter(p => quad(p) === 'horse').map(p => ({ x: p.uds, y: p.avg, name: p.name, rev: p.rev })), backgroundColor: QC.horse },
            { label: 'Incógnitas (caro, poco popular)', data: top.filter(p => quad(p) === 'puzzle').map(p => ({ x: p.uds, y: p.avg, name: p.name, rev: p.rev })), backgroundColor: QC.puzzle },
            { label: 'Perros (poco de ambos)', data: top.filter(p => quad(p) === 'dog').map(p => ({ x: p.uds, y: p.avg, name: p.name, rev: p.rev })), backgroundColor: QC.dog },
        ].map(ds => ({ ...ds, pointRadius: (ctx) => 4 + 10 * Math.sqrt((ctx.raw?.rev || 0) / maxRev), pointHoverRadius: (ctx) => 6 + 10 * Math.sqrt((ctx.raw?.rev || 0) / maxRev) })),
    };
    const opts = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
            datalabels: { display: false },
            tooltip: { callbacks: { label: (t) => `${t.raw.name}: ${ns(t.raw.x)} ud · ${eur2(t.raw.y)}/ud · ${eur(t.raw.rev)}` } },
        },
        scales: {
            x: { type: 'logarithmic', title: { display: true, text: 'Unidades vendidas (popularidad, escala log)' }, grid: { color: '#f0f0ec' } },
            y: { title: { display: true, text: 'Precio medio €/ud' }, grid: { color: '#f0f0ec' } },
        },
    };

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Centro</span>
                {buList.map(b => <Pill key={b} active={bu === b} onClick={() => setBu(b)}>{BU_LABEL[b]}</Pill>)}
            </div>
            <Card className="p-5 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Popularidad vs precio — {BU_LABEL[bu] || bu}</h3>
                <p className="text-[11px] text-gray-400 mb-3">Tamaño del punto = facturación. Líneas divisorias en la mediana. <b className="text-gray-500">Estrellas</b>: muy pedidos y caros. <b className="text-gray-500">Caballos</b>: muy pedidos pero baratos (suben margen si repricing). <b className="text-gray-500">Incógnitas</b>: caros pero poco pedidos (promocionar). <b className="text-gray-500">Perros</b>: candidatos a retirar.</p>
                <div className="h-96"><Scatter data={data} options={opts} /></div>
                <p className="text-[11px] text-gray-400 mt-3">Con precio (no margen). Cuando tengamos los costes de producción, el eje Y pasa a ser margen real y esto se convierte en la matriz de rentabilidad completa. Top 80 por facturación.</p>
            </Card>
        </div>
    );
};

/* ─────────────── #2 Seasonality ─────────────── */
const Seasonality = ({ products, seasonProduct, setSeasonProduct, data, search, setSearch }) => {
    const list = useMemo(() => {
        const s = search.trim().toUpperCase();
        return [...products.values()].filter(p => !s || p.descripcion.includes(s)).sort((a, b) => b.rev - a.rev).slice(0, 40);
    }, [products, search]);

    const { profile, seriesChart, peak } = useMemo(() => {
        if (!Array.isArray(data)) return { profile: null, seriesChart: null, peak: null };
        const byMonth = new Array(12).fill(0); const cntMonth = new Array(12).fill(0);
        const byYm = {};
        data.forEach(m => {
            const mo = +m.ym.slice(5) - 1; const rev = Number(m.rev) || 0;
            byMonth[mo] += rev; cntMonth[mo]++;
            byYm[m.ym] = (byYm[m.ym] || 0) + rev;
        });
        const avg = byMonth.map((v, i) => cntMonth[i] ? v / cntMonth[i] : 0);
        const maxi = avg.indexOf(Math.max(...avg));
        const yms = Object.keys(byYm).sort();
        return {
            profile: { labels: MES, datasets: [{ label: 'Media por mes', data: avg, backgroundColor: avg.map((_, i) => i === maxi ? '#4b7a52' : '#9dbf9a') }] },
            seriesChart: { labels: yms.map(m => MES[+m.slice(5) - 1] + " '" + m.slice(2, 4)), datasets: [{ label: 'Ventas netas', data: yms.map(m => byYm[m]), borderColor: '#4b7a52', backgroundColor: 'rgba(75,122,82,0.12)', fill: true, tension: 0.3, pointRadius: 2 }] },
            peak: maxi >= 0 ? MES[maxi] : null,
        };
    }, [data]);

    const sel = seasonProduct ? products.get(seasonProduct) : null;

    return (
        <div className="grid lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-2 p-5">
                <div className="flex items-baseline justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Elige un producto</h3>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" className="px-3 py-1 text-sm rounded-full border border-gray-200 focus:border-accent focus:outline-none w-36" />
                </div>
                <div className="max-h-[420px] overflow-y-auto -mr-2 pr-2">
                    {list.map(p => (
                        <button key={p.descripcion} onClick={() => setSeasonProduct(p.descripcion)}
                            className={clsx('w-full text-left px-3 py-2 rounded-lg mb-1 text-sm flex justify-between items-center', seasonProduct === p.descripcion ? 'bg-primary text-white' : 'hover:bg-accent/5 text-gray-700')}>
                            <span className="truncate">{p.name}</span>
                            <span className={clsx('tabular-nums text-xs ml-2', seasonProduct === p.descripcion ? 'text-white/80' : 'text-gray-400')}>{eur(p.rev)}</span>
                        </button>
                    ))}
                </div>
            </Card>
            <Card className="lg:col-span-3 p-5">
                {!sel ? <div className="text-center text-gray-400 italic py-16">Selecciona un producto.</div> : (
                    <div>
                        <h3 className="text-base font-semibold text-gray-800">{sel.name}</h3>
                        <p className="text-xs text-gray-400 mb-4">{sel.dept} · patrón estacional {peak && <>· pico en <b className="text-primary">{peak}</b></>}</p>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Perfil por mes del año (media)</div>
                        <div className="h-44 mb-5">{Array.isArray(data) && profile ? <BarChartInline chart={profile} /> : <div className="text-gray-400 italic text-sm py-12 text-center">Cargando…</div>}</div>
                        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Serie completa 2024–2026</div>
                        <div className="h-40">{Array.isArray(data) && seriesChart ? <Line data={seriesChart} options={lineOpts} /> : null}</div>
                        <p className="text-[11px] text-gray-400 mt-3">El perfil por mes (arriba) promedia los años para revelar la temporada — útil para planificar producción/compra contra la demanda real.</p>
                    </div>
                )}
            </Card>
        </div>
    );
};

/* ─────────────── #5 Price consistency ─────────────── */
const PriceConsistency = ({ products, search, setSearch }) => {
    const rows = useMemo(() => {
        const s = search.trim().toUpperCase();
        const out = [];
        products.forEach(p => {
            if (p.channels.size < 2) return;
            if (s && !p.descripcion.includes(s)) return;
            const prices = [];
            p.channels.forEach((c, bu) => { if (c.uds > 0) prices.push({ bu, price: c.rev / c.uds, uds: c.uds }); });
            if (prices.length < 2) return;
            const vals = prices.map(x => x.price);
            const min = Math.min(...vals), max = Math.max(...vals);
            const spread = min > 0 ? (max - min) / min * 100 : 0;
            out.push({ ...p, prices: prices.sort((a, b) => b.price - a.price), min, max, spread });
        });
        return out.sort((a, b) => b.spread - a.spread).slice(0, 50);
    }, [products, search]);

    return (
        <Card className="p-5">
            <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-700">Precio realizado por canal — artículos vendidos en 2+ canales</h3>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" className="px-3 py-1 text-sm rounded-full border border-gray-200 focus:border-accent focus:outline-none w-40" />
            </div>
            <p className="text-[11px] text-gray-400 mb-3">Precio medio = € neto / unidades en cada canal. Un <b>spread</b> grande puede ser correcto (mayorista vs. carta) o una fuga de margen / precio incoherente. Ordenado por spread.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead><tr className="text-[10.5px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                        <th className="text-left font-semibold py-2 pr-2">Artículo</th>
                        <th className="text-left font-semibold py-2 px-2">Precio por canal (€/ud)</th>
                        <th className="text-right font-semibold py-2 px-2">Mín</th>
                        <th className="text-right font-semibold py-2 px-2">Máx</th>
                        <th className="text-right font-semibold py-2 pl-2">Spread</th>
                    </tr></thead>
                    <tbody>
                        {rows.map(p => (
                            <tr key={p.descripcion} className="border-b border-gray-50 align-top">
                                <td className="py-2 pr-2"><span className="font-medium text-gray-800">{p.name}</span>{p.dept && <span className="ml-2 text-[10px] text-gray-400">{p.dept}</span>}</td>
                                <td className="py-2 px-2">
                                    <div className="flex flex-wrap gap-1">
                                        {p.prices.map(x => (
                                            <span key={x.bu} className="text-[11px] rounded px-1.5 py-0.5 text-white" style={{ background: BU_COLOR[x.bu] }} title={`${BU_LABEL[x.bu]} · ${ns(x.uds)} ud`}>{BU_LABEL[x.bu]}: {eur2(x.price)}</span>
                                        ))}
                                    </div>
                                </td>
                                <td className="py-2 px-2 text-right tabular-nums text-gray-600">{eur2(p.min)}</td>
                                <td className="py-2 px-2 text-right tabular-nums text-gray-600">{eur2(p.max)}</td>
                                <td className="py-2 pl-2 text-right tabular-nums font-semibold" ><span className={clsx(p.spread > 100 ? 'text-red-600' : p.spread > 40 ? 'text-amber-600' : 'text-gray-500')}>{p.spread.toFixed(0)}%</span></td>
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 italic py-8">Sin artículos multi-canal para este filtro.</td></tr>}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

/* shared chart bits */
const lineOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: (t) => eur(t.raw) } } },
    scales: { y: { ticks: { callback: v => '€' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v) }, grid: { color: '#f0f0ec' } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } } },
};
const BarChartInline = ({ chart }) => (
    <Bar data={chart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: (t) => eur(t.raw) } } }, scales: { y: { ticks: { callback: v => '€' + (v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)) }, grid: { color: '#f0f0ec' } }, x: { grid: { display: false } } } }} />
);

export default ProductIntelligence;
