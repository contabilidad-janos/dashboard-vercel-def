import React, { useEffect, useMemo, useState } from 'react';
import { DataService } from '../services/dataService';
import { format, subDays, differenceInCalendarDays, parseISO, startOfYear } from 'date-fns';
import PicadeliFilters from './picadeli/PicadeliFilters';
import PicadeliKPIs from './picadeli/PicadeliKPIs';
import PicadeliHourlyChart from './picadeli/PicadeliHourlyChart';
import PicadeliTopProductsTable from './picadeli/PicadeliTopProductsTable';
import PicadeliProductModal from './picadeli/PicadeliProductModal';

const today = () => format(new Date(), 'yyyy-MM-dd');

// "Public" clients are the anonymous retail / walk-in buckets — everything else
// is a named client (owner, employees, B2B accounts). Used to compute the
// named-client concentration warning per product.
const PUBLIC_CLIENTS = new Set(['Clientes varios', 'CLIENTES CONTADO', '0', '', null]);
const isPublicClient = (c) => PUBLIC_CLIENTS.has(c);

// Clients pre-selected by the "Excluir internos" preset. Matched case-insensitively
// as substrings so minor name variants still catch (e.g. "EMPLEADOS 20").
const INTERNAL_CLIENT_PATTERNS = ['CHRISTIAN', 'EMPLEADOS'];

const PicadeliProducts = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [rows, setRows] = useState([]);
    const [filterOptions, setFilterOptions] = useState({ departamentos: [], secciones: [], marcasMapeadas: [] });
    const [dateBounds, setDateBounds] = useState({ min: null, max: null });
    const [inventory, setInventory] = useState({ snapshotDate: null, items: [] });
    const [selectedProductKey, setSelectedProductKey] = useState(null);

    // Filters
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 90), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(today());
    const [selectedDeps, setSelectedDeps] = useState([]);
    const [selectedSecs, setSelectedSecs] = useState([]);
    const [selectedMarcas, setSelectedMarcas] = useState([]);
    const [excludedClients, setExcludedClients] = useState([]);
    const [search, setSearch] = useState('');

    // Load filter options + date bounds + inventory snapshot once
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [opts, bounds, inv] = await Promise.all([
                    DataService.getPicadeliFilterOptions(),
                    DataService.getPicadeliDateBounds(),
                    DataService.getPicadeliInventory(),
                ]);
                if (cancelled) return;
                setFilterOptions(opts);
                setDateBounds(bounds);
                setInventory(inv);
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
        return rows.filter(r => {
            if (selectedDeps.length > 0 && !selectedDeps.includes(r.departamento)) return false;
            if (selectedSecs.length > 0 && !selectedSecs.includes(r.seccion)) return false;
            if (selectedMarcas.length > 0 && !selectedMarcas.includes(r.marca_mapeada)) return false;
            if (excl.size > 0 && excl.has(r.cliente || '')) return false;
            if (s && !(r.descripcion || '').includes(s)) return false;
            return true;
        });
    }, [rows, selectedDeps, selectedSecs, selectedMarcas, excludedClients, search]);

    // Client list derived from current date-range rows, sorted by revenue desc.
    // We always compute over the full (pre-client-filter) set so excluded
    // clients remain visible in the UI and can be toggled back on.
    const clientOptions = useMemo(() => {
        const byClient = new Map();
        rows.forEach(r => {
            const c = r.cliente || '';
            const agg = byClient.get(c) || { cliente: c, revenue: 0 };
            agg.revenue += Number(r.importe) || 0;
            byClient.set(c, agg);
        });
        return [...byClient.values()]
            .sort((a, b) => b.revenue - a.revenue)
            .map(x => ({ ...x, isPublic: isPublicClient(x.cliente) }));
    }, [rows]);

    const applyInternalPreset = () => {
        const matched = clientOptions
            .filter(c => !c.isPublic && INTERNAL_CLIENT_PATTERNS.some(p => c.cliente.toUpperCase().includes(p)))
            .map(c => c.cliente);
        setExcludedClients(matched);
    };

    const windowDays = useMemo(
        () => Math.max(1, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1),
        [startDate, endDate]
    );
    const endParsed = useMemo(() => parseISO(endDate), [endDate]);

    const inventoryByKey = useMemo(() => {
        const m = new Map();
        inventory.items.forEach(i => { m.set(i.articulo_normalized, i); });
        return m;
    }, [inventory]);

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
                    publicRevenue: 0,
                    publicUnits: 0,
                    clientRevenue: new Map(),
                    salesDates: new Set(),
                    lastDate: null,
                };
                map.set(key, agg);
            }
            const uds = Number(r.uds) || 0;
            const imp = Number(r.importe) || 0;
            agg.units += uds;
            agg.revenue += imp;
            if (isPublicClient(r.cliente)) {
                agg.publicRevenue += imp;
                agg.publicUnits += uds;
            } else {
                const key2 = r.cliente || '';
                agg.clientRevenue.set(key2, (agg.clientRevenue.get(key2) || 0) + imp);
            }
            if (r.date) {
                agg.salesDates.add(r.date);
                if (!agg.lastDate || r.date > agg.lastDate) agg.lastDate = r.date;
            }
        });
        const totalRevenue = [...map.values()].reduce((s, p) => s + p.revenue, 0) || 1;
        return [...map.values()].map(p => {
            let topNamedClient = null;
            let topNamedClientRevenue = 0;
            p.clientRevenue.forEach((rev, name) => {
                if (rev > topNamedClientRevenue) { topNamedClient = name; topNamedClientRevenue = rev; }
            });
            const namedRevenue = p.revenue - p.publicRevenue;
            const inv = inventoryByKey.get(p.descripcion) || null;
            const velocity = p.units / windowDays;
            const publicVelocity = p.publicUnits / windowDays;
            // Days of stock is computed against *public* velocity so internal
            // consumption doesn't compress the runway estimate.
            const stockUnits = inv ? Number(inv.stock_units) : null;
            const daysOfStock = (inv && publicVelocity > 0) ? stockUnits / publicVelocity : null;
            return {
                descripcion: p.descripcion,
                descripcion_raw: p.descripcion_raw,
                departamento: p.departamento,
                seccion: p.seccion,
                marca_mapeada: p.marca_mapeada,
                units: p.units,
                revenue: p.revenue,
                publicUnits: p.publicUnits,
                publicRevenue: p.publicRevenue,
                avgPrice: p.units > 0 ? p.revenue / p.units : 0,
                pctRevenue: (p.revenue / totalRevenue) * 100,
                publicShare: p.revenue > 0 ? (p.publicRevenue / p.revenue) * 100 : 0,
                namedShare: p.revenue > 0 ? (namedRevenue / p.revenue) * 100 : 0,
                topNamedClient,
                topNamedClientShare: p.revenue > 0 ? (topNamedClientRevenue / p.revenue) * 100 : 0,
                velocity,
                publicVelocity,
                lastDate: p.lastDate,
                daysSinceSold: p.lastDate ? differenceInCalendarDays(endParsed, parseISO(p.lastDate)) : null,
                stockUnits,
                stockValue: inv ? Number(inv.stock_value) : null,
                stockPrice: inv ? Number(inv.precio_unidad) : null,
                stockProveedor: inv?.proveedor || null,
                hasInventory: !!inv,
                daysOfStock,
            };
        });
    }, [filteredRows, windowDays, endParsed, inventoryByKey]);

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
        let totalRevenue = 0, totalUnits = 0, publicRevenue = 0;
        filteredRows.forEach(r => {
            const imp = Number(r.importe) || 0;
            totalRevenue += imp;
            totalUnits += Number(r.uds) || 0;
            if (isPublicClient(r.cliente)) publicRevenue += imp;
        });
        const lineCount = filteredRows.length;
        const avgLineValue = lineCount > 0 ? totalRevenue / lineCount : 0;
        const activeProducts = products.length;
        const publicShare = totalRevenue > 0 ? (publicRevenue / totalRevenue) * 100 : 0;

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
            publicShare,
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
                clientOptions={clientOptions}
                excludedClients={excludedClients}
                toggleClient={toggleClient}
                onExcludeInternal={applyInternalPreset}
                onClearExcludedClients={clearExcludedClients}
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
                    <PicadeliTopProductsTable
                        products={products}
                        windowDays={windowDays}
                        inventorySnapshotDate={inventory.snapshotDate}
                        onSelectProduct={setSelectedProductKey}
                    />
                </>
            )}

            {selectedProductKey && (
                <PicadeliProductModal
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

export default PicadeliProducts;
