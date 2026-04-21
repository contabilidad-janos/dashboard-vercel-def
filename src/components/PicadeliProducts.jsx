import React, { useEffect, useMemo, useState } from 'react';
import { DataService } from '../services/dataService';
import { format, subDays, differenceInCalendarDays, parseISO, startOfYear } from 'date-fns';
import PicadeliFilters from './picadeli/PicadeliFilters';
import PicadeliKPIs from './picadeli/PicadeliKPIs';
import PicadeliHourlyChart from './picadeli/PicadeliHourlyChart';
import PicadeliTopProductsTable from './picadeli/PicadeliTopProductsTable';

const today = () => format(new Date(), 'yyyy-MM-dd');

const PicadeliProducts = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [rows, setRows] = useState([]);
    const [filterOptions, setFilterOptions] = useState({ departamentos: [], secciones: [], marcasMapeadas: [] });
    const [dateBounds, setDateBounds] = useState({ min: null, max: null });

    // Filters
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 90), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(today());
    const [selectedDeps, setSelectedDeps] = useState([]);
    const [selectedSecs, setSelectedSecs] = useState([]);
    const [selectedMarcas, setSelectedMarcas] = useState([]);
    const [search, setSearch] = useState('');

    // Load filter options + date bounds once
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [opts, bounds] = await Promise.all([
                    DataService.getPicadeliFilterOptions(),
                    DataService.getPicadeliDateBounds(),
                ]);
                if (cancelled) return;
                setFilterOptions(opts);
                setDateBounds(bounds);
            } catch (e) {
                if (!cancelled) setError(e.message || String(e));
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Load rows for the selected range
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const data = await DataService.getPicadeliRaw(startDate, endDate);
                if (!cancelled) setRows(data || []);
            } catch (e) {
                if (!cancelled) setError(e.message || String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [startDate, endDate]);

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
        return rows.filter(r => {
            if (selectedDeps.length > 0 && !selectedDeps.includes(r.departamento)) return false;
            if (selectedSecs.length > 0 && !selectedSecs.includes(r.seccion)) return false;
            if (selectedMarcas.length > 0 && !selectedMarcas.includes(r.marca_mapeada)) return false;
            if (s && !(r.descripcion || '').includes(s)) return false;
            return true;
        });
    }, [rows, selectedDeps, selectedSecs, selectedMarcas, search]);

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
                    marca_mapeada: r.marca_mapeada,
                    units: 0,
                    revenue: 0,
                    salesDates: new Set(),
                    lastDate: null,
                };
                map.set(key, agg);
            }
            agg.units += Number(r.uds) || 0;
            agg.revenue += Number(r.importe) || 0;
            if (r.date) {
                agg.salesDates.add(r.date);
                if (!agg.lastDate || r.date > agg.lastDate) agg.lastDate = r.date;
            }
        });
        const totalRevenue = [...map.values()].reduce((s, p) => s + p.revenue, 0) || 1;
        return [...map.values()].map(p => ({
            ...p,
            avgPrice: p.units > 0 ? p.revenue / p.units : 0,
            pctRevenue: (p.revenue / totalRevenue) * 100,
            velocity: p.units / windowDays,
            daysSinceSold: p.lastDate ? differenceInCalendarDays(endParsed, parseISO(p.lastDate)) : null,
        }));
    }, [filteredRows, windowDays, endParsed]);

    const hourly = useMemo(() => {
        const rev = new Array(24).fill(0);
        const uds = new Array(24).fill(0);
        filteredRows.forEach(r => {
            const h = Number(r.hour);
            if (!Number.isFinite(h) || h < 0 || h > 23) return;
            rev[h] += Number(r.importe) || 0;
            uds[h] += Number(r.uds) || 0;
        });
        const firstH = 7, lastH = 23;
        const labels = [];
        const revenue = [];
        const units = [];
        for (let h = firstH; h <= lastH; h++) {
            labels.push(`${String(h).padStart(2, '0')}:00`);
            revenue.push(rev[h]);
            units.push(uds[h]);
        }
        return { labels, revenue, units };
    }, [filteredRows]);

    const metrics = useMemo(() => {
        const totalRevenue = filteredRows.reduce((s, r) => s + (Number(r.importe) || 0), 0);
        const totalUnits = filteredRows.reduce((s, r) => s + (Number(r.uds) || 0), 0);
        const lineCount = filteredRows.length;
        const avgLineValue = lineCount > 0 ? totalRevenue / lineCount : 0;
        const activeProducts = products.length;

        const topProduct = products.reduce((t, p) => (!t || p.revenue > t.revenue) ? p : t, null);
        const topProductShare = topProduct && totalRevenue > 0 ? (topProduct.revenue / totalRevenue) * 100 : 0;

        let bestHour = null, bestRev = 0, totalHourRev = 0;
        hourly.revenue.forEach((v, i) => {
            totalHourRev += v;
            if (v > bestRev) { bestRev = v; bestHour = parseInt(hourly.labels[i], 10); }
        });
        const bestHourShare = totalHourRev > 0 ? (bestRev / totalHourRev) * 100 : 0;

        return {
            totalRevenue, totalUnits, avgLineValue, activeProducts,
            topProductShare, topProductName: topProduct?.descripcion_raw || '—',
            bestHour, bestHourShare,
        };
    }, [filteredRows, products, hourly]);

    return (
        <div className="animate-in fade-in duration-500">
            <div className="mb-6">
                <h2 className="text-3xl md:text-4xl font-serif text-primary">Best Selling Products — Picadeli</h2>
                <p className="text-sm text-gray-500 mt-1">Product-level analytics: what sells, when, and what to restock.</p>
            </div>

            <PicadeliFilters
                startDate={startDate} endDate={endDate}
                onDateChange={(s, e) => { setStartDate(s); if (e) setEndDate(e); }}
                onPreset={applyPreset}
                departamentos={filterOptions.departamentos}
                selectedDeps={selectedDeps} toggleDep={toggleDep}
                secciones={seccionesForDep}
                selectedSecs={selectedSecs} toggleSec={toggleSec}
                marcas={filterOptions.marcasMapeadas}
                selectedMarcas={selectedMarcas} setSelectedMarcas={setSelectedMarcas}
                search={search} setSearch={setSearch}
            />

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-center text-gray-400 italic py-12">Loading Picadeli sales…</div>
            ) : (
                <>
                    <PicadeliKPIs metrics={metrics} />
                    <PicadeliHourlyChart hourly={hourly} />
                    <PicadeliTopProductsTable products={products} windowDays={windowDays} />
                </>
            )}
        </div>
    );
};

export default PicadeliProducts;
