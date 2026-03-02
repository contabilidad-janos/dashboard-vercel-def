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
            DataService._fetchYearData(2024),
            DataService.getBusinessUnits(),
        ]);
        const result = initBuArrays(buList, 12);
        data.forEach(record => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            result[unitName][new Date(record.date).getMonth()] += Number(record.amount);
        });
        return result;
    },

    get2024SalesDataWeekly: async () => {
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
            result[unitName].push(Number(record.amount));
        });

        if (extraData) {
            extraData.forEach(record => {
                const unitName = record.business_units?.name;
                if (!unitName || !result[unitName]) return;
                const len = result[unitName].length;
                if (len > 0) result[unitName][len - 1] += Number(record.amount);
            });
        }
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

    // ── CAN ESCARRER ─────────────────────────────────────────────────────────

    getCanEscarrerData: async () => {
        return _fetchPaginated('ventas can escarrer', '*');
    },
};
