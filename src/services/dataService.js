import {
    BUSINESS_UNITS_CONFIG,
    SALES_2025_MONTHLY,
    SALES_2025_WEEKLY,
    TRANS_2025_MONTHLY,
    TRANS_2025_WEEKLY,
    SPEND_2025_MONTHLY,
    BUDGET_2025_MONTHLY,
    BUDGET_BY_UNIT_2025,
    RAW_WEEKLY_DATA_2024,
    WEEK_MONTH_MAP,
    WEEKLY_LABELS_2025
} from '../data/SEED_DATA';
import { supabase } from './supabaseClient';

// Re-export constants needed by components
export { WEEK_MONTH_MAP, WEEKLY_LABELS_2025, BUSINESS_UNITS_CONFIG };

// Constants
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const CHART_COLORS = ['#6E8C71', '#B09B80', '#D9825F', '#E8C89A', '#879FA8', '#566E7A', '#C4BFAA', '#A9A9A9'];

export const BUSINESS_UNITS = BUSINESS_UNITS_CONFIG.map(u => u.name);

// Logic to process RAW 2024 data into useful structures (replicating original script logic)
const process2024Data = () => {
    const weeklySales = {};
    const weeklyTrans = {};
    const weeklySpend = {};
    const monthlySales = {};
    const monthlyTrans = {};
    const monthlySpend = {};

    BUSINESS_UNITS_CONFIG.forEach(unit => {
        const bu = unit.name;
        weeklySales[bu] = [];
        weeklyTrans[bu] = [];
        weeklySpend[bu] = [];
        monthlySales[bu] = new Array(12).fill(0);
        monthlyTrans[bu] = new Array(12).fill(0);
        monthlySpend[bu] = new Array(12).fill(0);

        // Map simplified keys
        let rawKey = '';
        if (bu === 'Juntos house') rawKey = 'jh';
        else if (bu === 'Juntos boutique') rawKey = 'jb';
        else if (bu === 'Picadeli') rawKey = 'pic';
        else if (bu === 'Juntos farm shop') rawKey = 'jfs';
        else if (bu === 'Tasting place') rawKey = 'tp';
        else if (bu === 'Distribution b2b') rawKey = 'b2b';

        RAW_WEEKLY_DATA_2024.forEach((row, i) => {
            if (rawKey && row[rawKey]) {
                const vol = row[rawKey].v || 0;
                const spend = row[rawKey].s || 0;
                weeklyTrans[bu].push(vol);
                weeklySpend[bu].push(spend);
                weeklySales[bu].push(Math.round(vol * spend));

                // Aggregate Monthly
                const mIndex = WEEK_MONTH_MAP[i];
                if (mIndex !== undefined) {
                    monthlyTrans[bu][mIndex] += vol;
                    monthlySales[bu][mIndex] += Math.round(vol * spend);
                }
            } else {
                weeklyTrans[bu].push(0);
                weeklySpend[bu].push(0);
                weeklySales[bu].push(0);

                // Aggregate Monthly (0)
                const mIndex = WEEK_MONTH_MAP[i];
                if (mIndex !== undefined) {
                    monthlyTrans[bu][mIndex] += 0;
                    monthlySales[bu][mIndex] += 0;
                }
            }
        });

        // Calculate Monthly Spend Avg
        monthlySales[bu].forEach((totalSales, mIndex) => {
            const totalVol = monthlyTrans[bu][mIndex];
            monthlySpend[bu][mIndex] = totalVol > 0 ? Math.round(totalSales / totalVol) : 0;
        });
    });

    return { weeklySales, weeklyTrans, weeklySpend, monthlySales, monthlyTrans, monthlySpend };
};

const PROCESSED_2024 = process2024Data();


// Mock Service - Will be replaced by Supabase calls
export const DataService = {
    getBusinessUnits: async () => {
        const { data, error } = await supabase.from('business_units').select('*');
        if (error) {
            console.error('Error fetching units:', error);
            return [];
        }
        return data;
    },

    // Helper: Parse DD/MM/YYYY
    _parseDate: (dateStr) => {
        if (!dateStr) return null;
        // Check if YYYY-MM-DD
        if (dateStr.includes('-')) return new Date(dateStr);
        // Assume DD/MM/YYYY
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`); // YYYY-MM-DD
        }
        return null;
    },

    // Helper: Parse "1,234.56" or "1234.56"
    _parseAmount: (amtStr) => {
        if (typeof amtStr === 'number') return amtStr;
        if (!amtStr) return 0;
        // Remove commas
        const clean = amtStr.replace(/,/g, '');
        return parseFloat(clean) || 0;
    },

    // New definitive source fetcher
    _fetchDailyDef2025: async () => {
        // Fetch all 2025 data using pagination to bypass 1000 row limit
        let allData = [];
        let from = 0;
        const chunkSize = 1000;
        let done = false;

        while (!done) {
            const { data, error } = await supabase
                .from('sales_daily_def')
                .select('date, revenue, business_unit, VOLUME')
                .range(from, from + chunkSize - 1)
                .order('date', { ascending: true });

            if (error) {
                console.error('Error fetching sales_daily_def chunk:', error);
                break;
            }


            if (data && data.length > 0) {
                allData = allData.concat(data);
                from += chunkSize;
                if (data.length < chunkSize) {
                    done = true;
                }
            } else {
                done = true;
            }
        }
        return allData;
    },

    get2025RawData: async () => {
        return await DataService._fetchDailyDef2025();
    },

    get2025SalesData: async () => {
        const data = await DataService._fetchDailyDef2025();

        // Transform to { 'Unit Name': [Jan, Feb, ...] }
        const result = {};
        const buList = await DataService.getBusinessUnits();

        // Initialize arrays
        buList.forEach(u => {
            result[u.name] = new Array(12).fill(0);
        });

        // BU Name Mapping from CSV/Table to Config Names
        const buMap = {
            'Juntos house': 'Juntos house',
            'Juntos boutique': 'Juntos boutique',
            'Picadeli': 'Picadeli',
            'Juntos farm shop': 'Juntos farm shop',
            'Tasting place': 'Tasting place',
            'Distribution b2b': 'Distribution b2b',
            'Juntos Products': 'Juntos Products',
            'Activities': 'Activities',
            // Map variations if any found in inspection
        };

        data.forEach((record, index) => {
            // New column: business_unit
            const rawBu = record.business_unit;
            const buName = buMap[rawBu] || rawBu;

            if (!buName || !result[buName]) return;

            // New column: date (Date string YYYY-MM-DD from DB date type)
            if (!record.date) return;
            const dateObj = new Date(record.date);

            // FILTER ONLY 2025
            if (dateObj.getFullYear() !== 2025) return;

            const monthIndex = dateObj.getMonth();

            // New column: revenue (numeric)
            const amount = Number(record.revenue) || 0;

            result[buName][monthIndex] += amount;
        });

        return result;
    },

    get2025SalesDataWeekly: async () => {
        const data = await DataService._fetchDailyDef2025();

        const result = {};
        const buList = await DataService.getBusinessUnits();

        // Initialize with correct length matching labels
        const weeksCount = WEEKLY_LABELS_2025.length;

        buList.forEach(u => {
            result[u.name] = new Array(weeksCount).fill(0);
        });

        // BU Mapping (Same as get2025SalesData)
        const buMap = {
            'Juntos house': 'Juntos house',
            'Juntos boutique': 'Juntos boutique',
            'Picadeli': 'Picadeli',
            'Juntos farm shop': 'Juntos farm shop',
            'Tasting place': 'Tasting place',
            'Distribution b2b': 'Distribution b2b',
            'Juntos Products': 'Juntos Products',
            'Activities': 'Activities'
        };

        // Helper to get week index (0-52) from date
        const getWeekNumber = (d) => {
            const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
            return weekNo - 1;
        };

        data.forEach((record, index) => {
            const rawBu = record.business_unit;
            const buName = buMap[rawBu] || rawBu;

            if (!buName || !result[buName]) return;

            if (!record.date) return;
            const dateObj = new Date(record.date);

            let weekIdx = getWeekNumber(dateObj);

            // SPECIAL CASE: Dec 29 2025 - Jan 4 2026 should be Week 53 (Index 52)
            // This prevents it from wrapping to Index 0 (Week 1 of 2026) in this specific 2025 view context
            const y = dateObj.getFullYear();
            const m = dateObj.getMonth();
            const d = dateObj.getDate();
            if ((y === 2025 && m === 11 && d >= 29) || (y === 2026 && m === 0 && d <= 4)) {
                weekIdx = 52;
            }

            if (weekIdx >= 0 && weekIdx < weeksCount) {
                const amount = Number(record.revenue) || 0;
                result[buName][weekIdx] += amount;
            }
        });

        // Convert TypedArray/Array to ensure simple array returns (strip empty tails if needed, 
        // but charts usually expect matching length to labels)
        Object.keys(result).forEach(key => {
            result[key] = result[key].slice(0, weeksCount);
        });

        return result;
    },

    get2025BudgetData: async () => {
        const { data, error } = await supabase
            .from('budget_targets')
            .select('target_amount, month_start, business_units(name)')
            .gte('month_start', '2025-01-01');

        if (error) {
            console.error('Error fetching budget:', error);
            return {};
        }

        const result = {};
        // Initialize
        (await DataService.getBusinessUnits()).forEach(u => {
            result[u.name] = new Array(12).fill(0);
        });

        data.forEach((record, index) => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            const monthIndex = new Date(record.month_start).getMonth();
            result[unitName][monthIndex] += Number(record.target_amount);
        });

        return result;
    },

    get2025BudgetDataByUnit: async () => {
        // Functionally same as above for our structure
        return DataService.get2025BudgetData();
    },

    get2025TransData: async () => {
        const data = await DataService._fetchDailyDef2025();

        const result = {};
        const buList = await DataService.getBusinessUnits();

        // Initialize arrays
        buList.forEach(u => {
            result[u.name] = new Array(12).fill(0);
        });

        // Use same map as sales
        const buMap = {
            'Juntos house': 'Juntos house',
            'Juntos boutique': 'Juntos boutique',
            'Picadeli': 'Picadeli',
            'Juntos farm shop': 'Juntos farm shop',
            'Tasting place': 'Tasting place',
            'Distribution b2b': 'Distribution b2b',
            'Juntos Products': 'Juntos Products',
            'Activities': 'Activities'
        };

        data.forEach((record, index) => {
            const rawBu = record.business_unit;
            const buName = buMap[rawBu] || rawBu;

            if (!buName || !result[buName]) return;
            if (!record.date) return;

            const dateObj = new Date(record.date);
            // FILTER ONLY 2025
            if (dateObj.getFullYear() !== 2025) return;

            const monthIndex = dateObj.getMonth();
            // Use VOLUME column which we verified exists (uppercase)
            const vol = Number(record.VOLUME) || 0;

            result[buName][monthIndex] += vol;
        });

        return result;
    },

    get2025TransDataWeekly: async () => {
        const data = await DataService._fetchDailyDef2025();

        const result = {};
        const buList = await DataService.getBusinessUnits();
        const weeksCount = WEEKLY_LABELS_2025.length;

        buList.forEach(u => {
            result[u.name] = new Array(weeksCount).fill(0);
        });

        const buMap = {
            'Juntos house': 'Juntos house',
            'Juntos boutique': 'Juntos boutique',
            'Picadeli': 'Picadeli',
            'Juntos farm shop': 'Juntos farm shop',
            'Tasting place': 'Tasting place',
            'Distribution b2b': 'Distribution b2b',
            'Juntos Products': 'Juntos Products',
            'Activities': 'Activities'
        };

        const getWeekNumber = (d) => {
            const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
            return weekNo - 1;
        };

        data.forEach((record, index) => {
            const rawBu = record.business_unit;
            const buName = buMap[rawBu] || rawBu;

            if (!buName || !result[buName]) return;
            if (!record.date) return;

            const dateObj = new Date(record.date);
            let weekIdx = getWeekNumber(dateObj);

            // SPECIAL CASE: Cross-over week (Dec 29 2025 - Jan 4 2026) -> Index 52
            const y = dateObj.getFullYear();
            const m = dateObj.getMonth();
            const d = dateObj.getDate();
            if ((y === 2025 && m === 11 && d >= 29) || (y === 2026 && m === 0 && d <= 4)) {
                weekIdx = 52;
            }

            if (weekIdx >= 0 && weekIdx < weeksCount) {
                const vol = Number(record.VOLUME) || 0;
                result[buName][weekIdx] += vol;
            }
        });

        return result;
    },

    get2025SpendData: async () => {
        const sales = await DataService.get2025SalesData();
        const trans = await DataService.get2025TransData();

        const result = {};
        Object.keys(sales).forEach(unit => {
            result[unit] = sales[unit].map((s, i) => {
                const t = trans[unit][i];
                return t > 0 ? Math.round(s / t) : 0;
            });
        });
        return result;
    },

    // Generic fetch helper (internal)
    _fetchYearData: async (year) => {
        const { data, error } = await supabase
            .from('sales_records')
            .select('amount, transaction_count, date, business_units(name)')
            .gte('date', `${year}-01-01`)
            .lte('date', `${year}-12-31`)
            .order('date', { ascending: true });

        if (error) {
            console.error(`Error fetching ${year} data:`, error);
            return [];
        }
        return data;
    },

    get2024SalesData: async () => {
        const data = await DataService._fetchYearData(2024);
        const result = {};
        (await DataService.getBusinessUnits()).forEach(u => result[u.name] = new Array(12).fill(0));

        data.forEach((record, index) => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            const monthIndex = new Date(record.date).getMonth();
            result[unitName][monthIndex] += Number(record.amount);
        });
        return result;
    },

    get2024SalesDataWeekly: async () => {
        const data = await DataService._fetchYearData(2024);

        // FETCH EXTRA "SPILLOVER" DATA from early 2025 (Week 53 part 2)
        const { data: extraData } = await supabase
            .from('sales_records')
            .select('amount, transaction_count, date, business_units(name)')
            .gte('date', '2025-01-01')
            .lte('date', '2025-01-05');

        const result = {};
        (await DataService.getBusinessUnits()).forEach(u => result[u.name] = []);

        // Note: 2024 data is weekly-seeded, so chronological push works perfectly
        data.forEach((record) => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            result[unitName].push(Number(record.amount));
        });

        // MERGE EXTRA DATA INTO LAST WEEK (Index 52)
        if (extraData) {
            extraData.forEach((record) => {
                const unitName = record.business_units?.name;
                if (!unitName || !result[unitName]) return;

                // Ensure we have at least 53 weeks (Index 52)
                // If the main fetch already pushed 53 items, we add to the last one
                const len = result[unitName].length;
                if (len > 0) {
                    result[unitName][len - 1] += Number(record.amount);
                }
            });
        }

        return result;
    },

    get2024TransData: async () => {
        const data = await DataService._fetchYearData(2024);
        const result = {};
        (await DataService.getBusinessUnits()).forEach(u => result[u.name] = new Array(12).fill(0));

        data.forEach((record, index) => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            const monthIndex = new Date(record.date).getMonth();
            result[unitName][monthIndex] += Number(record.transaction_count);
        });
        return result;
    },

    get2024TransDataWeekly: async () => {
        const data = await DataService._fetchYearData(2024);

        // FETCH EXTRA "SPILLOVER" DATA from early 2025
        const { data: extraData } = await supabase
            .from('sales_records')
            .select('amount, transaction_count, date, business_units(name)')
            .gte('date', '2025-01-01')
            .lte('date', '2025-01-05');

        const result = {};
        (await DataService.getBusinessUnits()).forEach(u => result[u.name] = []);

        data.forEach((record) => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            result[unitName].push(Number(record.transaction_count));
        });

        // MERGE EXTRA DATA
        if (extraData) {
            extraData.forEach((record) => {
                const unitName = record.business_units?.name;
                if (!unitName || !result[unitName]) return;

                const len = result[unitName].length;
                if (len > 0) {
                    result[unitName][len - 1] += Number(record.transaction_count);
                }
            });
        }

        return result;
    },

    get2024SpendData: async () => {
        const sales = await DataService.get2024SalesData();
        const trans = await DataService.get2024TransData();

        const result = {};
        Object.keys(sales).forEach(unit => {
            result[unit] = sales[unit].map((s, i) => {
                const t = trans[unit][i];
                return t > 0 ? Math.round(s / t) : 0;
            });
        });
        return result;
    },

    get2024SpendDataWeekly: async () => {
        const sales = await DataService.get2024SalesDataWeekly();
        const trans = await DataService.get2024TransDataWeekly();

        const result = {};
        Object.keys(sales).forEach(unit => {
            result[unit] = sales[unit].map((s, i) => {
                const t = trans[unit][i] || 0;
                return t > 0 ? Math.round(s / t) : 0;
            });
        });
        return result;
    },

    // New fetcher for "ventas can escarrer"
    getCanEscarrerData: async () => {
        // Fetch all data without filter for client-side processing
        // Given typically reporting data < 100k rows, this is fine.
        // If it grows, we might need server-side filtering.
        let allData = [];
        let from = 0;
        const chunkSize = 1000;
        let done = false;

        while (!done) {
            const { data, error } = await supabase
                .from('ventas can escarrer')
                .select('*')
                .range(from, from + chunkSize - 1)
            // .order('Fecha', { ascending: true }); // Optional sorting

            if (error) {
                console.error('Error fetching Can Escarrer data:', error);
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
        return allData;
    },

    // ------------------------------------------------------------------
    // 2026 DATA FETCHERS
    // ------------------------------------------------------------------

    get2026SalesData: async () => {
        // reuse the same fetcher but filter for 2026
        const data = await DataService._fetchDailyDef2025(); // Currently fetches all "daily def" data

        // Transform to { 'Unit Name': [Jan, Feb, ...] }
        const result = {};
        const buList = await DataService.getBusinessUnits();

        // Initialize arrays
        buList.forEach(u => {
            result[u.name] = new Array(12).fill(0);
        });

        // BU Name Mapping
        const buMap = {
            'Juntos house': 'Juntos house',
            'Juntos boutique': 'Juntos boutique',
            'Picadeli': 'Picadeli',
            'Juntos farm shop': 'Juntos farm shop',
            'Tasting place': 'Tasting place',
            'Distribution b2b': 'Distribution b2b',
            'Juntos Products': 'Juntos Products',
            'Activities': 'Activities',
        };

        data.forEach((record) => {
            if (!record.date) return;
            const dateObj = new Date(record.date);

            // FILTER ONLY 2026
            if (dateObj.getFullYear() !== 2026) return;

            const rawBu = record.business_unit;
            const buName = buMap[rawBu] || rawBu;

            if (!buName || !result[buName]) return;

            const monthIndex = dateObj.getMonth();
            const amount = Number(record.revenue) || 0;

            result[buName][monthIndex] += amount;
        });

        return result;
    },

    get2026TransData: async () => {
        const data = await DataService._fetchDailyDef2025();

        const result = {};
        const buList = await DataService.getBusinessUnits();

        buList.forEach(u => {
            result[u.name] = new Array(12).fill(0);
        });

        const buMap = {
            'Juntos house': 'Juntos house',
            'Juntos boutique': 'Juntos boutique',
            'Picadeli': 'Picadeli',
            'Juntos farm shop': 'Juntos farm shop',
            'Tasting place': 'Tasting place',
            'Distribution b2b': 'Distribution b2b',
            'Juntos Products': 'Juntos Products',
            'Activities': 'Activities'
        };

        data.forEach((record) => {
            if (!record.date) return;
            const dateObj = new Date(record.date);

            // FILTER ONLY 2026
            if (dateObj.getFullYear() !== 2026) return;

            const rawBu = record.business_unit;
            const buName = buMap[rawBu] || rawBu;

            if (!buName || !result[buName]) return;

            const monthIndex = dateObj.getMonth();
            const vol = Number(record.VOLUME) || 0;

            result[buName][monthIndex] += vol;
        });

        return result;
    },

    get2026SpendData: async () => {
        const sales = await DataService.get2026SalesData();
        const trans = await DataService.get2026TransData();

        const result = {};
        Object.keys(sales).forEach(unit => {
            result[unit] = sales[unit].map((s, i) => {
                const t = trans[unit][i];
                return t > 0 ? Math.round(s / t) : 0;
            });
        });
        return result;
    },

    // Placeholder for 2026 Budget (assuming no table yet, or same table)
    get2026BudgetData: async () => {
        const { data, error } = await supabase
            .from('budget_targets')
            .select('target_amount, month_start, business_units(name)')
            .gte('month_start', '2026-01-01');

        if (error) {
            console.error('Error fetching budget:', error);
            return {};
        }

        const result = {};
        (await DataService.getBusinessUnits()).forEach(u => {
            result[u.name] = new Array(12).fill(0);
        });

        data.forEach((record) => {
            const unitName = record.business_units?.name;
            if (!unitName || !result[unitName]) return;
            const monthIndex = new Date(record.month_start).getMonth();
            result[unitName][monthIndex] += Number(record.target_amount);
        });

        return result;
    }
};
