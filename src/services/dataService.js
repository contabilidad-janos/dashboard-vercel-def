import {
    BUSINESS_UNITS_CONFIG,
    RAW_WEEKLY_DATA_2024,
    WEEK_MONTH_MAP,
    WEEKLY_LABELS_2025,
    WEEKLY_LABELS_2026
} from '../data/SEED_DATA';
import { supabase } from './supabaseClient';

// Re-export constants needed by components
export { WEEK_MONTH_MAP, WEEKLY_LABELS_2025, WEEKLY_LABELS_2026, BUSINESS_UNITS_CONFIG };

// Constants
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const CHART_COLORS = ['#6E8C71', '#B09B80', '#D9825F', '#E8C89A', '#879FA8', '#566E7A', '#C4BFAA', '#A9A9A9'];

export const BUSINESS_UNITS = BUSINESS_UNITS_CONFIG.map(u => u.name);

// ─── IN-MEMORY CACHE ─────────────────────────────────────────────────────────
const _cache = {};

const _fetchPaginated = async (tableName, selectFields, filters = []) => {
    const cacheKey = `${tableName}::${selectFields}::${JSON.stringify(filters)}`;
    if (_cache[cacheKey]) return _cache[cacheKey];

    let allData = [];
    let from = 0;
    const chunkSize = 1000;
    let done = false;

    while (!done) {
        let query = supabase
            .from(tableName)
            .select(selectFields)
            .range(from, from + chunkSize - 1)
            .order('date', { ascending: true });

        filters.forEach(({ method, col, val }) => {
            query = query[method](col, val);
        });

        const { data, error } = await query;

        if (error) {
            console.error(`Error fetching ${tableName}:`, error);
            break;
        }

        if (data && data.length > 0) {
            allData = allData.concat(data);
            from += chunkSize;
            if (data.length < chunkSize) done = true;
        } else {
            done = true;
        }
    }

    _cache[cacheKey] = allData;
    return allData;
};

/** Invalidate all cached data (e.g. after n8n upload) */
export const clearDataCache = () => {
    Object.keys(_cache).forEach(k => delete _cache[k]);
};

// ─── BU NAME MAP ─────────────────────────────────────────────────────────────
const BU_MAP = {
    'Juntos house': 'Juntos house',
    'Juntos boutique': 'Juntos boutique',
    'Picadeli': 'Picadeli',
    'Juntos farm shop': 'Juntos farm shop',
    'Tasting place': 'Tasting place',
    'Distribution b2b': 'Distribution b2b',
    'Juntos Products': 'Juntos Products',
    'Activities': 'Activities',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
/** Parse VOLUME safely: handles numeric, text with commas, and null */
const parseVolume = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace(/,/g, '')) || 0;
};

const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7) - 1;
};

const initBuArrays = (buList, size) => {
    const result = {};
    buList.forEach(u => { result[u.name] = new Array(size).fill(0); });
    return result;
};

// ─── PROCESS 2024 STATIC DATA ────────────────────────────────────────────────
const process2024Data = () => {
    const weeklySales = {}, weeklyTrans = {}, weeklySpend = {};
    const monthlySales = {}, monthlyTrans = {}, monthlySpend = {};

    BUSINESS_UNITS_CONFIG.forEach(unit => {
        const bu = unit.name;
        weeklySales[bu] = []; weeklyTrans[bu] = []; weeklySpend[bu] = [];
        monthlySales[bu] = new Array(12).fill(0);
        monthlyTrans[bu] = new Array(12).fill(0);
        monthlySpend[bu] = new Array(12).fill(0);

        const KEY_MAP = {
            'Juntos house': 'jh', 'Juntos boutique': 'jb', 'Picadeli': 'pic',
            'Juntos farm shop': 'jfs', 'Tasting place': 'tp', 'Distribution b2b': 'b2b',
        };
        const rawKey = KEY_MAP[bu] || '';

        RAW_WEEKLY_DATA_2024.forEach((row, i) => {
            const vol = rawKey && row[rawKey] ? row[rawKey].v || 0 : 0;
            const spend = rawKey && row[rawKey] ? row[rawKey].s || 0 : 0;
            weeklyTrans[bu].push(vol);
            weeklySpend[bu].push(spend);
            weeklySales[bu].push(Math.round(vol * spend));

            const mIndex = WEEK_MONTH_MAP[i];
            if (mIndex !== undefined) {
                monthlyTrans[bu][mIndex] += vol;
                monthlySales[bu][mIndex] += Math.round(vol * spend);
            }
        });

        monthlySales[bu].forEach((totalSales, mIndex) => {
            const totalVol = monthlyTrans[bu][mIndex];
            monthlySpend[bu][mIndex] = totalVol > 0 ? Math.round(totalSales / totalVol) : 0;
        });
    });

    return { weeklySales, weeklyTrans, weeklySpend, monthlySales, monthlyTrans, monthlySpend };
};

const PROCESSED_2024 = process2024Data();

// ─── DATA SERVICE ─────────────────────────────────────────────────────────────
export const DataService = {

    getBusinessUnits: async () => {
        const { data, error } = await supabase.from('business_units').select('*');
        if (error) { console.error('Error fetching units:', error); return []; }
        return data;
    },

    // ── INTERNAL FETCHERS ────────────────────────────────────────────────────

    /** Fetch all daily records for 2024 (server-side filtered + cached) */
    _fetchDailyDef2024: async () => {
        return _fetchPaginated(
            'sales_daily_def',
            'date, revenue, business_unit, VOLUME',
            [
                { method: 'gte', col: 'date', val: '2024-01-01' },
                { method: 'lte', col: 'date', val: '2024-12-31' },
            ]
        );
    },

    /** Fetch all daily records for 2025 (server-side filtered + cached) */
    _fetchDailyDef2025: async () => {
        return _fetchPaginated(
            'sales_daily_def',
            'date, revenue, business_unit, VOLUME',
            [
                { method: 'gte', col: 'date', val: '2025-01-01' },
                { method: 'lte', col: 'date', val: '2025-12-31' },
            ]
        );
    },

    /** Fetch all daily records for 2026 (server-side filtered + cached) */
    _fetchDailyDef2026: async () => {
        return _fetchPaginated(
            'sales_daily_def',
            'date, revenue, business_unit, VOLUME',
            [
                { method: 'gte', col: 'date', val: '2026-01-01' },
                { method: 'lte', col: 'date', val: '2026-12-31' },
            ]
        );
    },

    /** Fetch aggregated monthly data from sales_records (2024 historic) */
    _fetchYearData: async (year) => {
        const cacheKey = `sales_records::${year}`;
        if (_cache[cacheKey]) return _cache[cacheKey];

        const { data, error } = await supabase
            .from('sales_records')
            .select('amount, transaction_count, date, business_units(name)')
            .gte('date', `${year}-01-01`)
            .lte('date', `${year}-12-31`)
            .order('date', { ascending: true });

        if (error) { console.error(`Error fetching ${year} data:`, error); return []; }
        _cache[cacheKey] = data;
        return data;
    },

    // ── 2025 METHODS ─────────────────────────────────────────────────────────

    /** Returns raw daily records for 2025 (used for Daily view) */
    get2025RawData: async () => DataService._fetchDailyDef2025(),

    /** Returns raw daily records for 2026 (used for Daily view that crosses year boundary) */
    get2026RawData: async () => DataService._fetchDailyDef2026(),

    get2025SalesData: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2025(),
            DataService.getBusinessUnits(),
        ]);
        const result = initBuArrays(buList, 12);

        data.forEach(record => {
            if (!record.date) return;
            const dateObj = new Date(record.date);
            if (dateObj.getFullYear() !== 2025) return;
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;
            result[buName][dateObj.getMonth()] += Number(record.revenue) || 0;
        });
        return result;
    },

    get2025SalesDataWeekly: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2025(),
            DataService.getBusinessUnits(),
        ]);
        const weeksCount = WEEKLY_LABELS_2025.length;
        const result = initBuArrays(buList, weeksCount);

        data.forEach(record => {
            if (!record.date) return;
            const dateObj = new Date(record.date);
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;

            let weekIdx = getWeekNumber(dateObj);
            const { y, m, d } = { y: dateObj.getFullYear(), m: dateObj.getMonth(), d: dateObj.getDate() };
            // Special case: crossover week Dec 29–Jan 4 → idx 52
            if ((y === 2025 && m === 11 && d >= 29) || (y === 2026 && m === 0 && d <= 4)) weekIdx = 52;

            if (weekIdx >= 0 && weekIdx < weeksCount) {
                result[buName][weekIdx] += Number(record.revenue) || 0;
            }
        });
        Object.keys(result).forEach(k => { result[k] = result[k].slice(0, weeksCount); });
        return result;
    },

    get2025TransData: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2025(),
            DataService.getBusinessUnits(),
        ]);
        const result = initBuArrays(buList, 12);

        data.forEach(record => {
            if (!record.date) return;
            const dateObj = new Date(record.date);
            if (dateObj.getFullYear() !== 2025) return;
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;
            result[buName][dateObj.getMonth()] += parseVolume(record.VOLUME);
        });
        return result;
    },

    get2025TransDataWeekly: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2025(),
            DataService.getBusinessUnits(),
        ]);
        const weeksCount = WEEKLY_LABELS_2025.length;
        const result = initBuArrays(buList, weeksCount);

        data.forEach(record => {
            if (!record.date) return;
            const dateObj = new Date(record.date);
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;

            let weekIdx = getWeekNumber(dateObj);
            const { y, m, d } = { y: dateObj.getFullYear(), m: dateObj.getMonth(), d: dateObj.getDate() };
            if ((y === 2025 && m === 11 && d >= 29) || (y === 2026 && m === 0 && d <= 4)) weekIdx = 52;

            if (weekIdx >= 0 && weekIdx < weeksCount) {
                result[buName][weekIdx] += parseVolume(record.VOLUME);
            }
        });
        return result;
    },

    get2025SpendData: async () => {
        const [sales, trans] = await Promise.all([
            DataService.get2025SalesData(),
            DataService.get2025TransData(),
        ]);
        const result = {};
        Object.keys(sales).forEach(unit => {
            result[unit] = sales[unit].map((s, i) => {
                const t = trans[unit]?.[i] || 0;
                return t > 0 ? Math.round(s / t) : 0;
            });
        });
        return result;
    },

    get2025BudgetData: async () => {
        const cacheKey = 'budget_targets::2025';
        if (_cache[cacheKey]) return _cache[cacheKey];

        const { data, error } = await supabase
            .from('budget_targets')
            .select('target_amount, month_start, business_units(name)')
            .gte('month_start', '2025-01-01')
            .lte('month_start', '2025-12-31');

        if (error) { console.error('Error fetching budget:', error); return {}; }

        const buList = await DataService.getBusinessUnits();
        const result = initBuArrays(buList, 12);

        data.forEach(record => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            result[unitName][new Date(record.month_start).getMonth()] += Number(record.target_amount);
        });

        _cache[cacheKey] = result;
        return result;
    },

    get2025BudgetDataByUnit: async () => DataService.get2025BudgetData(),

    // ── 2024 METHODS ─────────────────────────────────────────────────────────

    get2024SalesData: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2024(),
            DataService.getBusinessUnits(),
        ]);
        const result = initBuArrays(buList, 12);

        data.forEach(record => {
            if (!record.date) return;
            const dateObj = new Date(record.date);
            if (dateObj.getFullYear() !== 2024) return;
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;
            result[buName][dateObj.getMonth()] += Number(record.revenue) || 0;
        });
        return result;
    },

    get2024SalesDataWeekly: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2024(),
            DataService.getBusinessUnits(),
        ]);
        const weeksCount = 53; // Need 53 weeks to store up to December 31
        const result = initBuArrays(buList, weeksCount);

        data.forEach(record => {
            if (!record.date) return;
            const dateObj = new Date(record.date);
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;

            let weekIdx = getWeekNumber(dateObj);
            const { y, m, d } = { y: dateObj.getFullYear(), m: dateObj.getMonth(), d: dateObj.getDate() };

            // For cross-over week starting end of Dec 2023 
            if ((y === 2024 && m === 11 && d >= 30) || (y === 2025 && m === 0 && d <= 5)) weekIdx = 52;

            if (weekIdx >= 0 && weekIdx < weeksCount) {
                result[buName][weekIdx] += Number(record.revenue) || 0;
            }
        });

        Object.keys(result).forEach(k => { result[k] = result[k].slice(0, weeksCount); });
        return result;
    },

    get2024TransData: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchYearData(2024),
            DataService.getBusinessUnits(),
        ]);
        const result = initBuArrays(buList, 12);
        data.forEach(record => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            result[unitName][new Date(record.date).getMonth()] += Number(record.transaction_count);
        });
        return result;
    },

    get2024TransDataWeekly: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchYearData(2024),
            DataService.getBusinessUnits(),
        ]);

        const { data: extraData } = await supabase
            .from('sales_records')
            .select('amount, transaction_count, date, business_units(name)')
            .gte('date', '2025-01-01')
            .lte('date', '2025-01-05');

        const result = {};
        buList.forEach(u => { result[u.name] = []; });

        data.forEach(record => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            result[unitName].push(Number(record.transaction_count));
        });

        if (extraData) {
            extraData.forEach(record => {
                const unitName = record.business_units?.name;
                if (!unitName || !result[unitName]) return;
                const len = result[unitName].length;
                if (len > 0) result[unitName][len - 1] += Number(record.transaction_count);
            });
        }
        return result;
    },

    get2024SpendData: async () => {
        const [sales, trans] = await Promise.all([
            DataService.get2024SalesData(),
            DataService.get2024TransData(),
        ]);
        const result = {};
        Object.keys(sales).forEach(unit => {
            result[unit] = sales[unit].map((s, i) => {
                const t = trans[unit]?.[i] || 0;
                return t > 0 ? Math.round(s / t) : 0;
            });
        });
        return result;
    },

    get2024SpendDataWeekly: async () => {
        const [sales, trans] = await Promise.all([
            DataService.get2024SalesDataWeekly(),
            DataService.get2024TransDataWeekly(),
        ]);
        const result = {};
        Object.keys(sales).forEach(unit => {
            result[unit] = sales[unit].map((s, i) => {
                const t = trans[unit]?.[i] || 0;
                return t > 0 ? Math.round(s / t) : 0;
            });
        });
        return result;
    },

    // ── 2026 METHODS (server-side filtered) ───────────────────────────────────

    get2026SalesData: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2026(),
            DataService.getBusinessUnits(),
        ]);
        const result = initBuArrays(buList, 12);

        data.forEach(record => {
            if (!record.date) return;
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;
            result[buName][new Date(record.date).getMonth()] += Number(record.revenue) || 0;
        });
        return result;
    },

    get2026TransData: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2026(),
            DataService.getBusinessUnits(),
        ]);
        const result = initBuArrays(buList, 12);

        data.forEach(record => {
            if (!record.date) return;
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;
            result[buName][new Date(record.date).getMonth()] += parseVolume(record.VOLUME);
        });
        return result;
    },

    get2026SpendData: async () => {
        const [sales, trans] = await Promise.all([
            DataService.get2026SalesData(),
            DataService.get2026TransData(),
        ]);
        const result = {};
        Object.keys(sales).forEach(unit => {
            result[unit] = sales[unit].map((s, i) => {
                const t = trans[unit]?.[i] || 0;
                return t > 0 ? Math.round(s / t) : 0;
            });
        });
        return result;
    },

    get2026BudgetData: async () => {
        const cacheKey = 'budget_targets::2026';
        if (_cache[cacheKey]) return _cache[cacheKey];

        const { data, error } = await supabase
            .from('budget_targets')
            .select('target_amount, month_start, business_units(name)')
            .gte('month_start', '2026-01-01')
            .lte('month_start', '2026-12-31');

        if (error) { console.error('Error fetching 2026 budget:', error); return {}; }

        const buList = await DataService.getBusinessUnits();
        const result = initBuArrays(buList, 12);

        data.forEach(record => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            result[unitName][new Date(record.month_start).getMonth()] += Number(record.target_amount);
        });

        _cache[cacheKey] = result;
        return result;
    },

    get2026SalesDataWeekly: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2026(),
            DataService.getBusinessUnits(),
        ]);
        const weeksCount = WEEKLY_LABELS_2026.length;
        const result = initBuArrays(buList, weeksCount);

        data.forEach(record => {
            if (!record.date) return;
            const dateObj = new Date(record.date);
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;

            const weekIdx = getWeekNumber(dateObj);
            if (weekIdx >= 0 && weekIdx < weeksCount) {
                result[buName][weekIdx] += Number(record.revenue) || 0;
            }
        });
        return result;
    },

    get2026TransDataWeekly: async () => {
        const [data, buList] = await Promise.all([
            DataService._fetchDailyDef2026(),
            DataService.getBusinessUnits(),
        ]);
        const weeksCount = WEEKLY_LABELS_2026.length;
        const result = initBuArrays(buList, weeksCount);

        data.forEach(record => {
            if (!record.date) return;
            const dateObj = new Date(record.date);
            const buName = BU_MAP[record.business_unit] || record.business_unit;
            if (!result[buName]) return;

            const weekIdx = getWeekNumber(dateObj);
            if (weekIdx >= 0 && weekIdx < weeksCount) {
                result[buName][weekIdx] += parseVolume(record.VOLUME);
            }
        });
        return result;
    },

    // ── PICADELI (product-level transactional data) ──────────────────────────

    /** Fetch Picadeli transactional rows within [startDate, endDate] (inclusive, YYYY-MM-DD). */
    getPicadeliRaw: async (startDate, endDate) => {
        const cacheKey = `picadeli_sales::${startDate}::${endDate}`;
        if (_cache[cacheKey]) return _cache[cacheKey];

        let allData = [];
        let from = 0;
        const chunkSize = 1000;
        let done = false;

        while (!done) {
            const { data, error } = await supabase
                .from('picadeli_sales')
                .select('date, hour, serie, cliente, descripcion, descripcion_raw, departamento, seccion, marca, marca_mapeada, uds, importe')
                .gte('date', startDate)
                .lte('date', endDate)
                .range(from, from + chunkSize - 1)
                .order('date', { ascending: true });

            if (error) {
                console.error('Error fetching picadeli_sales:', error);
                break;
            }
            if (data && data.length > 0) {
                allData = allData.concat(data);
                from += chunkSize;
                if (data.length < chunkSize) done = true;
            } else {
                done = true;
            }
        }

        _cache[cacheKey] = allData;
        return allData;
    },

    /** Fetch distinct filter option values (departamento, seccion, marca_mapeada). */
    getPicadeliFilterOptions: async () => {
        const cacheKey = 'picadeli_sales::filter_options';
        if (_cache[cacheKey]) return _cache[cacheKey];

        // Pull a distinct-ish sample by paging over the full table; values are small
        // cardinality (~15 departamentos, ~30 secciones, ~50 marcas), so even over
        // 130k rows a single page with limit(50000) typically covers all values.
        const { data, error } = await supabase
            .from('picadeli_sales')
            .select('departamento, seccion, marca_mapeada')
            .limit(50000);

        if (error) {
            console.error('Error fetching picadeli filter options:', error);
            return { departamentos: [], secciones: [], marcasMapeadas: [] };
        }

        const deps = new Set();
        const secs = new Set();
        const marcas = new Set();
        (data || []).forEach(r => {
            if (r.departamento) deps.add(r.departamento);
            if (r.seccion) secs.add(r.seccion);
            if (r.marca_mapeada) marcas.add(r.marca_mapeada);
        });

        const result = {
            departamentos: [...deps].sort(),
            secciones: [...secs].sort(),
            marcasMapeadas: [...marcas].sort(),
        };
        _cache[cacheKey] = result;
        return result;
    },

    /** Fetch the most recent inventory snapshot (or a specific snapshot_date). */
    getPicadeliInventory: async (snapshotDate = null) => {
        const cacheKey = `picadeli_inventory::${snapshotDate || 'latest'}`;
        if (_cache[cacheKey]) return _cache[cacheKey];

        let effectiveDate = snapshotDate;
        if (!effectiveDate) {
            const { data: latest } = await supabase
                .from('picadeli_inventory')
                .select('snapshot_date')
                .order('snapshot_date', { ascending: false })
                .limit(1);
            effectiveDate = latest?.[0]?.snapshot_date || null;
        }
        if (!effectiveDate) return { snapshotDate: null, items: [] };

        let allData = [];
        let from = 0;
        const chunkSize = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('picadeli_inventory')
                .select('articulo, articulo_normalized, proveedor, departamento, precio_unidad, stock_units, stock_value')
                .eq('snapshot_date', effectiveDate)
                .range(from, from + chunkSize - 1);
            if (error) { console.error('Error fetching picadeli_inventory:', error); break; }
            if (!data || data.length === 0) break;
            allData = allData.concat(data);
            if (data.length < chunkSize) break;
            from += chunkSize;
        }

        const result = { snapshotDate: effectiveDate, items: allData };
        _cache[cacheKey] = result;
        return result;
    },

    /** Fetch the min/max date present in picadeli_sales (for sensible default ranges). */
    getPicadeliDateBounds: async () => {
        const cacheKey = 'picadeli_sales::date_bounds';
        if (_cache[cacheKey]) return _cache[cacheKey];

        const [minRes, maxRes] = await Promise.all([
            supabase.from('picadeli_sales').select('date').order('date', { ascending: true }).limit(1),
            supabase.from('picadeli_sales').select('date').order('date', { ascending: false }).limit(1),
        ]);

        const result = {
            min: minRes.data?.[0]?.date || null,
            max: maxRes.data?.[0]?.date || null,
        };
        _cache[cacheKey] = result;
        return result;
    },

    // ── CAN ESCARRER (line-level invoice data: DISTRIBUCION / SHOP / TASTING) ──

    /** Fetch Can Escarrer transactional rows for a given BU within [startDate, endDate]. */
    getCanEscarrerRaw: async (bu, startDate, endDate) => {
        const cacheKey = `can_escarrer_sales::${bu}::${startDate}::${endDate}`;
        if (_cache[cacheKey]) return _cache[cacheKey];

        let allData = [];
        let from = 0;
        const chunkSize = 1000;
        let done = false;

        while (!done) {
            const { data, error } = await supabase
                .from('can_escarrer_sales')
                .select('date, bu, serie, cliente, tipo_cliente, origen, descripcion, descripcion_raw, departamento, seccion, familia, marca, budget, uds, importe, precio_unitario')
                .eq('bu', bu)
                .gte('date', startDate)
                .lte('date', endDate)
                .range(from, from + chunkSize - 1)
                .order('date', { ascending: true });

            if (error) {
                console.error('Error fetching can_escarrer_sales:', error);
                break;
            }
            if (data && data.length > 0) {
                allData = allData.concat(data);
                from += chunkSize;
                if (data.length < chunkSize) done = true;
            } else {
                done = true;
            }
        }

        _cache[cacheKey] = allData;
        return allData;
    },

    /** Distinct filter option values per BU (departamento, seccion, marca, tipo_cliente, budget). */
    getCanEscarrerFilterOptions: async (bu) => {
        const cacheKey = `can_escarrer_sales::filter_options::${bu}`;
        if (_cache[cacheKey]) return _cache[cacheKey];

        const { data, error } = await supabase
            .from('can_escarrer_sales')
            .select('departamento, seccion, marca, tipo_cliente, budget')
            .eq('bu', bu)
            .limit(50000);

        if (error) {
            console.error('Error fetching can_escarrer filter options:', error);
            return { departamentos: [], secciones: [], marcas: [], tiposCliente: [], budgets: [] };
        }

        const deps = new Set();
        const secs = new Set();
        const marcas = new Set();
        const tipos = new Set();
        const budgets = new Set();
        (data || []).forEach(r => {
            if (r.departamento) deps.add(r.departamento);
            if (r.seccion) secs.add(r.seccion);
            if (r.marca) marcas.add(r.marca);
            if (r.tipo_cliente) tipos.add(r.tipo_cliente);
            if (r.budget) budgets.add(r.budget);
        });

        const result = {
            departamentos: [...deps].sort(),
            secciones: [...secs].sort(),
            marcas: [...marcas].sort(),
            tiposCliente: [...tipos].sort(),
            budgets: [...budgets].sort(),
        };
        _cache[cacheKey] = result;
        return result;
    },

    /** Min/max dates per BU. */
    getCanEscarrerDateBounds: async (bu) => {
        const cacheKey = `can_escarrer_sales::date_bounds::${bu}`;
        if (_cache[cacheKey]) return _cache[cacheKey];

        const [minRes, maxRes] = await Promise.all([
            supabase.from('can_escarrer_sales').select('date').eq('bu', bu).order('date', { ascending: true }).limit(1),
            supabase.from('can_escarrer_sales').select('date').eq('bu', bu).order('date', { ascending: false }).limit(1),
        ]);

        const result = {
            min: minRes.data?.[0]?.date || null,
            max: maxRes.data?.[0]?.date || null,
        };
        _cache[cacheKey] = result;
        return result;
    },
};