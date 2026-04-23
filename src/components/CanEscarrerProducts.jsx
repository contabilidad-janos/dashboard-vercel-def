import React, { useEffect, useMemo, useState } from 'react';
import { DataService } from '../services/dataService';
import { format, subDays, differenceInCalendarDays, parseISO, startOfYear } from 'date-fns';
import CanEscarrerFilters from './canEscarrer/CanEscarrerFilters';
import CanEscarrerKPIs from './canEscarrer/CanEscarrerKPIs';
import CanEscarrerTrendChart from './canEscarrer/CanEscarrerTrendChart';
import CanEscarrerTopProductsTable from './canEscarrer/CanEscarrerTopProductsTable';
import CanEscarrerProductModal from './canEscarrer/CanEscarrerProductModal';
import ComparePanel from './shared/ComparePanel';
import { presetPreviousPeriod } from '../utils/compare';

const today = () => format(new Date(), 'yyyy-MM-dd');

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const BU_LABELS = {
    DISTRIBUCION: 'Distribución',
    SHOP: 'Shop',
    TASTING: 'Tasting',
};

const CanEscarrerProducts = ({ bu }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [rows, setRows] = useState([]);
    const [filterOptions, setFilterOptions] = useState({ departamentos: [], secciones: [], marcas: [], tiposCliente: [], budgets: [] });
    const [dateBounds, setDateBounds] = useState({ min: null, max: null });
    const [selectedProductKey, setSelectedProductKey] = useState(null);

    // Filters — default to YTD for Can Escarrer BUs. B2B/retail benefits from
    // seeing the full year-in-progress rather than a rolling 90d window
    // (which leaves the current month's first weeks invisible).
    const [startDate, setStartDate] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(today());
    const [selectedDeps, setSelectedDeps] = useState([]);
    const [selectedSecs, setSelectedSecs] = useState([]);
    const [selectedMarcas, setSelectedMarcas] = useState([]);
    const [selectedTipos, setSelectedTipos] = useState([]);
    const [selectedOrigen, setSelectedOrigen] = useState(null);
    const [excludedClients, setExcludedClients] = useState([]);
    const [search, setSearch] = useState('');

    // Compare (Period B)
    const [compareEnabled, setCompareEnabled] = useState(false);
    const [compareStartDate, setCompareStartDate] = useState('');
    const [compareEndDate, setCompareEndDate] = useState('');
    const [rowsB, setRowsB] = useState([]);

    // Reset filters when BU changes — the option sets are BU-specific
    useEffect(() => {
        setSelectedDeps([]);
        setSelectedSecs([]);
        setSelectedMarcas([]);
        setSelectedTipos([]);
        setSelectedOrigen(null);
        setExcludedClients([]);
        setSearch('');
    }, [bu]);

    // Load filter options + date bounds for this BU
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [opts, bounds] = await Promise.all([
                    DataService.getCanEscarrerFilterOptions(bu),
                    DataService.getCanEscarrerDateBounds(bu),
                ]);
                if (cancelled) return;
                setFilterOptions(opts);
                setDateBounds(bounds);
            } catch (e) {
                if (!cancelled) setError(e.message || String(e));
            }
        })();
        return () => { cancelled = true; };
    }, [bu]);

    // Load rows for the current range + BU
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const data = await DataService.getCanEscarrerRaw(bu, startDate, endDate);
                if (!cancelled) setRows(data || []);
            } catch (e) {
                if (!cancelled) setError(e.message || String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [bu, startDate, endDate]);

    // Period B fetch
    useEffect(() => {
        if (!compareEnabled || !compareStartDate || !compareEndDate) {
            setRowsB([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const data = await DataService.getCanEscarrerRaw(bu, compareStartDate, compareEndDate);
                if (!cancelled) setRowsB(data || []);
            } catch {
                if (!cancelled) setRowsB([]);
            }
        })();
        return () => { cancelled = true; };
    }, [bu, compareEnabled, compareStartDate, compareEndDate]);

    const handleToggleCompare = (enabled) => {
        setCompareEnabled(enabled);
        if (enabled && (!compareStartDate || !compareEndDate)) {
            const [s, e] = presetPreviousPeriod(startDate, endDate);
            setCompareStartDate(s);
            setCompareEndDate(e);
        }
    };

    // Reset compare when BU changes (the previous range may not have data in the new BU)
    useEffect(() => {
        setCompareEnabled(false);
        setRowsB([]);
    }, [bu]);

    const applyPreset = (preset) => {
        const now = new Date();
        const end = format(now, 'yyyy-MM-dd');
        if (preset === '30d') { setStartDate(format(subDays(now, 30), 'yyyy-MM-dd')); setEndDate(end); }
        else if (preset === '90d') { setStartDate(format(subDays(now, 90), 'yyyy-MM-dd')); setEndDate(end); }
        else if (preset === 'ytd') { setStartDate(format(startOfYear(now), 'yyyy-MM-dd')); setEndDate(end); }
        else if (preset === '12m') { setStartDate(format(subDays(now, 365), 'yyyy-MM-dd')); setEndDate(end); }
        else if (preset === 'all' && dateBounds.min && dateBounds.max) {
            setStartDate(dateBounds.min); setEndDate(dateBounds.max);
        }
    };

    const toggleDep = (v) => {
        if (v === '__ALL__') { setSelectedDeps([]); setSelectedSecs([]); return; }
        setSelectedDeps(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v]);
    };
    const toggleSec = (v) => {
        if (v === '__ALL__') { setSelectedSecs([]); return; }
        setSelectedSecs(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v]);
    };
    const toggleTipo = (v) => {
        if (v === '__ALL__') { setSelectedTipos([]); return; }
        setSelectedTipos(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v]);
    };
    const toggleClient = (v) => {
        setExcludedClients(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v]);
    };
    const clearExcludedClients = () => setExcludedClients([]);

    // Sección list: narrow to selected Departamento when applicable
    const seccionesForDep = useMemo(() => {
        if (selectedDeps.length === 0) return filterOptions.secciones;
        const allowed = new Set();
        rows.forEach(r => {
            if (!r.departamento || !r.seccion) return;
            if (selectedDeps.includes(r.departamento)) allowed.add(r.seccion);
        });
        return [...allowed].sort();
    }, [selectedDeps, rows, filterOptions.secciones]);

    const filteredRows = useMemo(() => {
        const s = search.trim().toUpperCase();
        const excl = new Set(excludedClients);
        const tipos = new Set(selectedTipos);
        return rows.filter(r => {
            if (selectedDeps.length > 0 && !selectedDeps.includes(r.departamento)) return false;
            if (selectedSecs.length > 0 && !selectedSecs.includes(r.seccion)) return false;
            if (selectedMarcas.length > 0 && !selectedMarcas.includes(r.marca)) return false;
            if (tipos.size > 0 && !tipos.has(r.tipo_cliente)) return false;
            if (selectedOrigen && r.origen !== selectedOrigen) return false;
            if (excl.size > 0 && excl.has(r.cliente || '')) return false;
            if (s && !(r.descripcion || '').includes(s)) return false;
            return true;
        });
    }, [rows, selectedDeps, selectedSecs, selectedMarcas, selectedTipos, selectedOrigen, excludedClients, search]);

    // Client options ranked by revenue (pre client-filter)
    const clientOptions = useMemo(() => {
        const byClient = new Map();
        rows.forEach(r => {
            const c = r.cliente || '';
            const agg = byClient.get(c) || { cliente: c, revenue: 0, origen: r.origen };
            agg.revenue += Number(r.importe) || 0;
            byClient.set(c, agg);
        });
        return [...byClient.values()].sort((a, b) => b.revenue - a.revenue);
    }, [rows]);

    // "Excluir internos" preset uses ORIGEN=INTERNO — authoritative field
    const applyInternosPreset = () => {
        const interns = new Set();
        rows.forEach(r => {
            if ((r.origen || '').toUpperCase() === 'INTERNO' && r.cliente) interns.add(r.cliente);
        });
        setExcludedClients([...interns]);
    };

    const origenValues = useMemo(() => {
        const set = new Set();
        rows.forEach(r => { if (r.origen) set.add(r.origen); });
        return [...set].sort();
    }, [rows]);

    const windowDays = useMemo(
        () => Math.max(1, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1),
        [startDate, endDate]
    );
    const endParsed = useMemo(() => parseISO(endDate), [endDate]);

    const products = useMemo(() => {
        const map = new Map();
        filteredRows.forEach(r => {
            const key = r.descripcion;
            if (!key) return;
            let agg = map.get(key);
            if (!agg) {
                agg = {
                    descripcion: key,
                    descripcion_raw: r.descripcion_raw || r.descripcion,
                    departamento: r.departamento,
                    seccion: r.seccion,
                    marca: r.marca,
                    units: 0,
                    revenue: 0,
                    externalRevenue: 0,
                    clientRevenue: new Map(),
                    lastDate: null,
                };
                map.set(key, agg);
            }
            const uds = Number(r.uds) || 0;
            const imp = Number(r.importe) || 0;
            agg.units += uds;
            agg.revenue += imp;
            if ((r.origen || '').toUpperCase() === 'EXTERNO') agg.externalRevenue += imp;
            const cKey = r.cliente || '';
            agg.clientRevenue.set(cKey, (agg.clientRevenue.get(cKey) || 0) + imp);
            if (r.date) {
                if (!agg.lastDate || r.date > agg.lastDate) agg.lastDate = r.date;
            }
        });
        const totalRevenue = [...map.values()].reduce((s, p) => s + p.revenue, 0) || 1;
        return [...map.values()].map(p => {
            let topClient = null, topClientRevenue = 0;
            p.clientRevenue.forEach((rev, name) => {
                if (rev > topClientRevenue) { topClient = name; topClientRevenue = rev; }
            });
            return {
                descripcion: p.descripcion,
                descripcion_raw: p.descripcion_raw,
                departamento: p.departamento,
                seccion: p.seccion,
                marca: p.marca,
                units: p.units,
                revenue: p.revenue,
                avgPrice: p.units > 0 ? p.revenue / p.units : 0,
                pctRevenue: (p.revenue / totalRevenue) * 100,
                externalShare: p.revenue > 0 ? (p.externalRevenue / p.revenue) * 100 : 0,
                topClient,
                topClientShare: p.revenue > 0 ? (topClientRevenue / p.revenue) * 100 : 0,
                velocity: p.units / windowDays,
                lastDate: p.lastDate,
                daysSinceSold: p.lastDate ? differenceInCalendarDays(endParsed, parseISO(p.lastDate)) : null,
            };
        });
    }, [filteredRows, windowDays, endParsed]);

    // Monthly aggregation — use months present in the range.
    // Each bucket label: "MMM YY" (e.g. "Ene 24").
    const monthly = useMemo(() => {
        const byKey = new Map();
        filteredRows.forEach(r => {
            if (!r.date) return;
            const d = parseISO(r.date);
            const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
            const agg = byKey.get(key) || { revenue: 0, units: 0, y: d.getFullYear(), m: d.getMonth() };
            agg.revenue += Number(r.importe) || 0;
            agg.units += Number(r.uds) || 0;
            byKey.set(key, agg);
        });
        const sorted = [...byKey.values()].sort((a, b) => (a.y - b.y) || (a.m - b.m));
        return {
            labels: sorted.map(x => `${MONTH_LABELS[x.m]} ${String(x.y).slice(2)}`),
            revenue: sorted.map(x => x.revenue),
            units: sorted.map(x => x.units),
        };
    }, [filteredRows]);

    // Weekday pattern (Mon..Sun)
    const weekday = useMemo(() => {
        const rev = new Array(7).fill(0);
        const uds = new Array(7).fill(0);
        filteredRows.forEach(r => {
            if (!r.date) return;
            // Mon=0..Sun=6
            const jsDay = parseISO(r.date).getDay();
            const idx = (jsDay + 6) % 7;
            rev[idx] += Number(r.importe) || 0;
            uds[idx] += Number(r.uds) || 0;
        });
        return { labels: WEEKDAY_LABELS, revenue: rev, units: uds };
    }, [filteredRows]);

    // Period-B aggregates mirror the A-side filter logic so deltas are
    // apples-to-apples.
    const windowDaysB = useMemo(() => {
        if (!compareEnabled || !compareStartDate || !compareEndDate) return 0;
        return Math.max(1, differenceInCalendarDays(parseISO(compareEndDate), parseISO(compareStartDate)) + 1);
    }, [compareEnabled, compareStartDate, compareEndDate]);

    const compareAggregates = useMemo(() => {
        if (!compareEnabled) return null;
        const s = search.trim().toUpperCase();
        const excl = new Set(excludedClients);
        const tipos = new Set(selectedTipos);
        const byDesc = new Map();
        let totalRevenue = 0, totalUnits = 0, lineCount = 0;

        rowsB.forEach(r => {
            if (selectedDeps.length > 0 && !selectedDeps.includes(r.departamento)) return;
            if (selectedSecs.length > 0 && !selectedSecs.includes(r.seccion)) return;
            if (selectedMarcas.length > 0 && !selectedMarcas.includes(r.marca)) return;
            if (tipos.size > 0 && !tipos.has(r.tipo_cliente)) return;
            if (selectedOrigen && r.origen !== selectedOrigen) return;
            if (excl.size > 0 && excl.has(r.cliente || '')) return;
            if (s && !(r.descripcion || '').includes(s)) return;

            const imp = Number(r.importe) || 0;
            const uds = Number(r.uds) || 0;
            totalRevenue += imp;
            totalUnits += uds;
            lineCount++;

            if (r.descripcion) {
                const agg = byDesc.get(r.descripcion) || { revenue: 0, units: 0 };
                agg.revenue += imp;
                agg.units += uds;
                byDesc.set(r.descripcion, agg);
            }
        });

        const days = windowDaysB || 1;
        byDesc.forEach(v => { v.velocity = v.units / days; });

        return {
            byDesc,
            metrics: {
                totalRevenue,
                totalUnits,
                avgLineValue: lineCount > 0 ? totalRevenue / lineCount : 0,
                activeProducts: byDesc.size,
            },
        };
    }, [compareEnabled, rowsB, selectedDeps, selectedSecs, selectedMarcas, selectedTipos, selectedOrigen, excludedClients, search, windowDaysB]);

    const metrics = useMemo(() => {
        let totalRevenue = 0, totalUnits = 0, externalRevenue = 0;
        const clientRev = new Map();
        filteredRows.forEach(r => {
            const imp = Number(r.importe) || 0;
            totalRevenue += imp;
            totalUnits += Number(r.uds) || 0;
            if ((r.origen || '').toUpperCase() === 'EXTERNO') externalRevenue += imp;
            const c = r.cliente || '';
            clientRev.set(c, (clientRev.get(c) || 0) + imp);
        });
        const lineCount = filteredRows.length;
        const avgLineValue = lineCount > 0 ? totalRevenue / lineCount : 0;
        const activeProducts = products.length;
        const externalShare = totalRevenue > 0 ? (externalRevenue / totalRevenue) * 100 : 0;

        const topProduct = products.reduce((t, p) => (!t || p.revenue > t.revenue) ? p : t, null);
        const topProductShare = topProduct && totalRevenue > 0 ? (topProduct.revenue / totalRevenue) * 100 : 0;

        let topClientName = '—', topClientRev = 0;
        clientRev.forEach((v, k) => { if (v > topClientRev) { topClientRev = v; topClientName = k || '(sin cliente)'; } });
        const topClientShare = totalRevenue > 0 ? (topClientRev / totalRevenue) * 100 : 0;

        return {
            totalRevenue, totalUnits, avgLineValue, activeProducts,
            externalShare,
            topProductShare, topProductName: topProduct?.descripcion_raw || '—',
            topClientName, topClientShare,
        };
    }, [filteredRows, products]);

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-3xl md:text-4xl font-serif text-primary">
                    Best Selling Products — {BU_LABELS[bu] || bu}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Analítica a nivel de producto para Can Escarrer · {BU_LABELS[bu] || bu}.
                </p>
            </div>

            <CanEscarrerFilters
                startDate={startDate} endDate={endDate}
                onDateChange={(s, e) => { setStartDate(s); if (e) setEndDate(e); }}
                onPreset={applyPreset}
                departamentos={filterOptions.departamentos}
                selectedDeps={selectedDeps} toggleDep={toggleDep}
                secciones={seccionesForDep}
                selectedSecs={selectedSecs} toggleSec={toggleSec}
                marcas={filterOptions.marcas}
                selectedMarcas={selectedMarcas} setSelectedMarcas={setSelectedMarcas}
                tiposCliente={filterOptions.tiposCliente}
                selectedTipos={selectedTipos} toggleTipo={toggleTipo}
                origenValues={origenValues}
                selectedOrigen={selectedOrigen} setSelectedOrigen={setSelectedOrigen}
                clientOptions={clientOptions}
                excludedClients={excludedClients}
                toggleClient={toggleClient}
                onExcludeInternos={applyInternosPreset}
                onClearExcludedClients={clearExcludedClients}
                search={search} setSearch={setSearch}
                compareEnabled={compareEnabled}
                onToggleCompare={handleToggleCompare}
                compareSlot={(
                    <ComparePanel
                        enabled={compareEnabled}
                        onToggle={handleToggleCompare}
                        startA={startDate} endA={endDate}
                        startB={compareStartDate} endB={compareEndDate}
                        onChangeB={(s, e) => { setCompareStartDate(s); setCompareEndDate(e); }}
                    />
                )}
            />

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-center text-gray-400 italic py-12">Loading {BU_LABELS[bu] || bu} sales…</div>
            ) : (
                <>
                    <CanEscarrerKPIs
                        metrics={metrics}
                        metricsB={compareAggregates?.metrics || null}
                    />
                    <CanEscarrerTrendChart monthly={monthly} weekday={weekday} />
                    <CanEscarrerTopProductsTable
                        products={products}
                        windowDays={windowDays}
                        bu={bu}
                        onSelectProduct={setSelectedProductKey}
                        compareByDesc={compareAggregates?.byDesc || null}
                        compareRange={compareEnabled ? { start: compareStartDate, end: compareEndDate } : null}
                    />
                </>
            )}

            {selectedProductKey && (
                <CanEscarrerProductModal
                    productKey={selectedProductKey}
                    rows={filteredRows}
                    allRows={rows}
                    startDate={startDate}
                    endDate={endDate}
                    windowDays={windowDays}
                    product={products.find(p => p.descripcion === selectedProductKey) || null}
                    onClose={() => setSelectedProductKey(null)}
                />
            )}
        </div>
    );
};

export default CanEscarrerProducts;
