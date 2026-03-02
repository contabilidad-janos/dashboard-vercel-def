import React, { useEffect, useState, useMemo } from 'react';
import { DataService, MONTHS, BUSINESS_UNITS, WEEKLY_LABELS_2025, WEEKLY_LABELS_2026, WEEK_MONTH_MAP } from '../services/dataService';
import { Chart } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import clsx from 'clsx';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import DetailsFilters from './details/DetailsFilters';
import DetailsChart from './details/DetailsChart';
import DetailsTable from './details/DetailsTable';

Chart.register(ChartDataLabels);

// ── VAT Rates per business unit ────────────────────────────────────────────────
// IVA reducido España: Restauración 10%, Distribución/Productos 10%, Actividades variable
const VAT_RATES = {
    'Juntos house':      0.10,
    'Juntos boutique':   0.10,
    'Picadeli':          0.10,
    'Juntos farm shop':  0.10,
    'Tasting place':     0.10,
    'Distribution b2b':  0.10,
    'Juntos Products':   0.10,
    'Activities':        0.21,
};

// ── Color palette ─────────────────────────────────────────────────────────────
const BU_COLORS = {
    'Juntos house':      '#6E8C71',
    'Juntos boutique':   '#B09B80',
    'Picadeli':          '#D9825F',
    'Juntos farm shop':  '#E8C89A',
    'Tasting place':     '#879FA8',
    'Distribution b2b':  '#566E7A',
    'Juntos Products':   '#C4BFAA',
    'Activities':        '#A9A9A9',
    'All Groups':        '#405846',
};
const COLORS_ARRAY = Object.values(BU_COLORS);

// ── Helpers ───────────────────────────────────────────────────────────────────
const getLastWeekIndex = () => {
    const today = new Date();
    const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
    const lastWeekEnd   = endOfWeek(subWeeks(today, 1),   { weekStartsOn: 1 });
    const label = `${format(lastWeekStart, 'dd/MM')}-${format(lastWeekEnd, 'dd/MM')}`;
    const idx = WEEKLY_LABELS_2025.indexOf(label);
    return idx !== -1 ? idx : WEEKLY_LABELS_2025.length - 1;
};

const sumArr  = (arr) => (arr || []).reduce((s, v) => s + (v || 0), 0);
const safeNum = (v) => Number(v) || 0;

// ── Component ─────────────────────────────────────────────────────────────────
const DashboardDetails = () => {
    // ── State ─────────────────────────────────────────────────────────────────
    const [loading, setLoading]           = useState(true);
    const [rawData, setRawData]           = useState({});
    const [selectedYear, setSelectedYear] = useState('2025');
    const [selectedUnits, setSelectedUnits] = useState(['All Groups']);
    const [metric, setMetric]             = useState('sales');
    const [viewType, setViewType]         = useState('monthly');
    const [chartType, setChartType]       = useState('bar');
    const [dailyStart, setDailyStart]     = useState('2025-12-29');
    const [dailyEnd, setDailyEnd]         = useState('2026-01-04');
    const [startPeriod, setStartPeriod]   = useState(0);
    const [endPeriod, setEndPeriod]       = useState(11);
    const [compare24, setCompare24]       = useState(true);
    const [compareBudget, setCompareBudget] = useState(false);
    const [showLabels, setShowLabels]     = useState(true);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [excludeVat, setExcludeVat]     = useState(false);

    // ── Net value helper ──────────────────────────────────────────────────────
    const getNetValue = (val, unitName) => {
        if (!excludeVat || !val) return safeNum(val);
        const rate = VAT_RATES[unitName] ?? 0;
        return safeNum(val) / (1 + rate);
    };

    // ── Period reset on view change ───────────────────────────────────────────
    useEffect(() => {
        if (viewType === 'monthly') {
            setStartPeriod(0); setEndPeriod(11);
        } else if (viewType === 'weekly') {
            const idx = getLastWeekIndex();
            setStartPeriod(idx); setEndPeriod(idx);
        } else if (viewType === 'yearly') {
            setStartPeriod(0); setEndPeriod(1);
        }
        // daily: period state not used, dailyStart/End is used instead
    }, [viewType]);

    // ── Data fetch ────────────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            const [
                sales25, sales25w, trans25, trans25w, spend25,
                sales24, sales24w, trans24, trans24w, spend24,
                sales26, sales26w, trans26, trans26w, spend26,
                budget25u, budget26u,
                raw2025, raw2026,
            ] = await Promise.all([
                DataService.get2025SalesData(),       // sales25
                DataService.get2025SalesDataWeekly(), // sales25w
                DataService.get2025TransData(),       // trans25
                DataService.get2025TransDataWeekly(), // trans25w
                DataService.get2025SpendData(),       // spend25
                DataService.get2024SalesData(),       // sales24
                DataService.get2024SalesDataWeekly(), // sales24w
                DataService.get2024TransData(),       // trans24
                DataService.get2024TransDataWeekly(), // trans24w
                DataService.get2024SpendData(),       // spend24
                DataService.get2026SalesData(),       // sales26
                DataService.get2026SalesDataWeekly(), // sales26w
                DataService.get2026TransData(),       // trans26
                DataService.get2026TransDataWeekly(), // trans26w
                DataService.get2026SpendData(),       // spend26
                DataService.get2025BudgetDataByUnit(), // budget25u
                DataService.get2026BudgetData(),       // budget26u
                DataService.get2025RawData(),          // raw2025 (for daily view 2025 dates)
                DataService.get2026RawData(),          // raw2026 (for daily view 2026 dates)
            ]);

            setRawData({
                sales25, sales25w, trans25, trans25w, spend25,
                sales24, sales24w, trans24, trans24w, spend24,
                sales26, sales26w, trans26, trans26w, spend26,
                budget25u, budget26u,
                raw2025, raw2026,
            });
            setLoading(false);
        };
        load();
    }, []);

    // ── Event handlers ────────────────────────────────────────────────────────
    const toggleUnit = (u) =>
        setSelectedUnits(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);

    const handlePredefinedPeriod = ({ target: { value: val } }) => {
        if (viewType === 'monthly') {
            const MAP = { q1:[0,2], q2:[3,5], q3:[6,8], q4:[9,11], summer:[3,9], ytd:[0, new Date().getMonth()] };
            if (MAP[val]) { setStartPeriod(MAP[val][0]); setEndPeriod(MAP[val][1]); }
        } else if (viewType === 'weekly') {
            // Use correct label array length for the selected year
            const labels = selectedYear === '2026' ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025;
            const last = labels.length - 1;
            const MAP = { q1:[0,12], q2:[13,25], q3:[26,38], q4:[39, last] };
            if (MAP[val]) { setStartPeriod(MAP[val][0]); setEndPeriod(MAP[val][1]); }
        }
    };

    // ── Chart data computation (memoized) ─────────────────────────────────────
    const chartData = useMemo(() => {
        if (!rawData.sales25) return null;

        const is2026        = selectedYear === '2026';
        const currentSales  = is2026 ? rawData.sales26  : rawData.sales25;
        const currentSalesW = is2026 ? rawData.sales26w : rawData.sales25w;
        const currentTrans  = is2026 ? rawData.trans26  : rawData.trans25;
        const currentTransW = is2026 ? rawData.trans26w : rawData.trans25w;
        const currentSpend  = is2026 ? rawData.spend26  : rawData.spend25;
        const prevSales     = is2026 ? rawData.sales25  : rawData.sales24;
        const prevSalesW    = is2026 ? rawData.sales25w : rawData.sales24w;
        const prevTrans     = is2026 ? rawData.trans25  : rawData.trans24;
        const prevTransW    = is2026 ? rawData.trans25w : rawData.trans24w;
        const prevSpend     = is2026 ? rawData.spend25  : rawData.spend24;
        // Use the correct budget for the selected year
        const currentBudget = is2026 ? rawData.budget26u : rawData.budget25u;
        const labelsList    = is2026 ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025;

        // ── YEARLY VIEW ─────────────────────────────────────────────────────
        if (viewType === 'yearly') {
            const labels   = ['2024', '2025'];
            const datasets = [];

            const getYearlySpend = (salesMap, transMap, unit) => {
                const ts = sumArr(salesMap[unit]); const tt = sumArr(transMap[unit]);
                return tt > 0 ? Math.round(ts / tt) : 0;
            };

            selectedUnits.filter(u => u !== 'All Groups').forEach((unit, i) => {
                const color = COLORS_ARRAY[i % COLORS_ARRAY.length];
                let d24, d25;
                if (metric === 'sales') {
                    d24 = sumArr((rawData.sales24[unit] || []).map(v => getNetValue(v, unit)));
                    d25 = sumArr((rawData.sales25[unit] || []).map(v => getNetValue(v, unit)));
                } else if (metric === 'transactions') {
                    d24 = sumArr(rawData.trans24[unit]);
                    d25 = sumArr(rawData.trans25[unit]);
                } else {
                    d24 = getYearlySpend(rawData.sales24, rawData.trans24, unit);
                    d25 = getYearlySpend(rawData.sales25, rawData.trans25, unit);
                }
                datasets.push({
                    label: unit,
                    data: [d24, d25],
                    backgroundColor: ['#A9A9A9', color],
                    borderColor: ['#A9A9A9', color],
                    borderWidth: 2,
                });
            });

            if (selectedUnits.includes('All Groups')) {
                let t24 = 0, t25 = 0;
                if (metric === 'spend') {
                    let s24=0, r24=0, s25=0, r25=0;
                    BUSINESS_UNITS.forEach(u => {
                        s24 += sumArr(rawData.sales24[u]); r24 += sumArr(rawData.trans24[u]);
                        s25 += sumArr(rawData.sales25[u]); r25 += sumArr(rawData.trans25[u]);
                    });
                    t24 = r24>0?Math.round(s24/r24):0;
                    t25 = r25>0?Math.round(s25/r25):0;
                } else {
                    const key = metric === 'sales' ? 'sales' : 'trans';
                    BUSINESS_UNITS.forEach(u => {
                        t24 += sumArr(rawData[`${key}24`][u]);
                        t25 += sumArr(rawData[`${key}25`][u]);
                    });
                }
                datasets.push({
                    label: 'All Groups',
                    data: [t24, t25],
                    backgroundColor: ['#A9A9A9', '#405846'],
                    borderColor: ['#A9A9A9', '#405846'],
                    borderWidth: 3,
                });
            }
            return { labels, datasets };
        }

        // ── DAILY VIEW ──────────────────────────────────────────────────────
        if (viewType === 'daily') {
            const labels = [];
            const start  = new Date(dailyStart + 'T00:00:00');
            const end    = new Date(dailyEnd   + 'T00:00:00');
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                labels.push(d.toISOString().split('T')[0]);
            }

            // Merge 2025 + 2026 raw data for cross-year daily ranges
            const rawList = [...(rawData.raw2025 || []), ...(rawData.raw2026 || [])];

            const getValue = (dateStr, unitName) => {
                const records = rawList.filter(r => r.date === dateStr);
                if (unitName === 'All Groups') {
                    return BUSINESS_UNITS.reduce((total, u) => {
                        const v = records.filter(r => r.business_unit === u).reduce((s, r) => s + safeNum(r.revenue), 0);
                        return total + getNetValue(v, u);
                    }, 0);
                }
                const v = records.filter(r => r.business_unit === unitName).reduce((s, r) => s + safeNum(r.revenue), 0);
                return getNetValue(v, unitName);
            };

            const datasets = selectedUnits.map(unit => ({
                label: unit,
                data: labels.map(date => getValue(date, unit)),
                borderColor: BU_COLORS[unit] || '#999',
                backgroundColor: BU_COLORS[unit] || '#999',
                tension: 0.3, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2,
            }));
            return { labels, datasets };
        }

        // ── MONTHLY / WEEKLY VIEW ───────────────────────────────────────────
        const labels = viewType === 'monthly'
            ? MONTHS.slice(startPeriod, endPeriod + 1)
            : labelsList.slice(startPeriod, endPeriod + 1);

        const getDataSlice = (salesMap, transMap, spendMap, salesMapW, transMapW, unit) => {
            const sl = (arr) => (arr || []).slice(startPeriod, endPeriod + 1);
            if (viewType === 'monthly') {
                if (metric === 'sales')        return sl((salesMap[unit] || []).map(v => getNetValue(v, unit)));
                if (metric === 'transactions') return sl(transMap[unit]);
                return sl(spendMap[unit]);
            }
            // weekly
            if (metric === 'sales')        return sl((salesMapW[unit] || []).map(v => getNetValue(v, unit)));
            if (metric === 'transactions') return sl(transMapW[unit]);
            // weekly spend = sales/trans computed on the fly
            const s = salesMapW[unit] || []; const v = transMapW[unit] || [];
            return sl(s.map((val, idx) => v[idx] > 0 ? Math.round(getNetValue(val, unit) / v[idx]) : 0));
        };

        const datasets = [];

        selectedUnits.filter(u => u !== 'All Groups').forEach((unit, i) => {
            const color = COLORS_ARRAY[i % COLORS_ARRAY.length];
            const yearLabel = is2026 ? "'26" : "'25";
            const prevLabel = is2026 ? "'25" : "'24";

            datasets.push({
                label: `${unit} ${yearLabel}`,
                data: getDataSlice(currentSales, currentTrans, currentSpend, currentSalesW, currentTransW, unit),
                borderColor: color, backgroundColor: color, tension: 0.3, fill: false,
            });

            if (compare24) {
                datasets.push({
                    label: `${unit} ${prevLabel}`,
                    data: getDataSlice(prevSales, prevTrans, prevSpend, prevSalesW, prevTransW, unit),
                    borderColor: color, backgroundColor: color,
                    borderDash: [5, 5], borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0,
                });
            }

            if (compareBudget && metric === 'sales') {
                const bData = (currentBudget?.[unit] || []).map(v => getNetValue(v, unit));
                const budgetData = viewType === 'monthly'
                    ? bData.slice(startPeriod, endPeriod + 1)
                    : Array.from({ length: endPeriod - startPeriod + 1 }, (_, wi) =>
                        Math.round((bData[WEEK_MONTH_MAP[startPeriod + wi] ?? 0] || 0) / 4)
                      );
                datasets.push({
                    label: `${unit} Budget`,
                    data: budgetData,
                    borderColor: color, borderDash: [2, 2], borderWidth: 2,
                    pointStyle: 'rectRot', tension: 0, fill: false,
                });
            }
        });

        // ── All Groups aggregation ─────────────────────────────────────────
        if (selectedUnits.includes('All Groups')) {
            const dataLen   = endPeriod - startPeriod + 1;
            const aggCur    = new Array(dataLen).fill(0);
            const aggPrev   = new Array(dataLen).fill(0);
            const aggBudget = new Array(dataLen).fill(0);

            if (metric !== 'spend') {
                BUSINESS_UNITS.forEach(unit => {
                    getDataSlice(currentSales, currentTrans, currentSpend, currentSalesW, currentTransW, unit)
                        .forEach((v, i) => { aggCur[i] += v; });
                    if (compare24)
                        getDataSlice(prevSales, prevTrans, prevSpend, prevSalesW, prevTransW, unit)
                            .forEach((v, i) => { aggPrev[i] += v; });
                    if (compareBudget && metric === 'sales') {
                        const bData = (currentBudget?.[unit] || []).map(v => getNetValue(v, unit));
                        const bd = viewType === 'monthly'
                            ? bData.slice(startPeriod, endPeriod + 1)
                            : Array.from({ length: dataLen }, (_, wi) =>
                                Math.round((bData[WEEK_MONTH_MAP[startPeriod + wi] ?? 0] || 0) / 4)
                              );
                        bd.forEach((v, i) => { aggBudget[i] += v; });
                    }
                });
            } else {
                // Weighted average spend
                for (let i = 0; i < dataLen; i++) {
                    let ps=0, pt=0, ps2=0, pt2=0;
                    BUSINESS_UNITS.forEach(u => {
                        const idx = startPeriod + i;
                        const [cS, cT] = viewType === 'monthly'
                            ? [currentSales[u], currentTrans[u]]
                            : [currentSalesW[u], currentTransW[u]];
                        const [pS, pT] = viewType === 'monthly'
                            ? [prevSales[u], prevTrans[u]]
                            : [prevSalesW[u], prevTransW[u]];
                        ps  += getNetValue(cS?.[idx] || 0, u); pt  += cT?.[idx] || 0;
                        ps2 += getNetValue(pS?.[idx] || 0, u); pt2 += pT?.[idx] || 0;
                    });
                    aggCur[i]  = pt  > 0 ? Math.round(ps  / pt)  : 0;
                    aggPrev[i] = pt2 > 0 ? Math.round(ps2 / pt2) : 0;
                }
            }

            const yearLabel = is2026 ? "'26" : "'25";
            const prevLabel = is2026 ? "'25" : "'24";
            datasets.unshift({
                label: `All Groups ${yearLabel}`,
                data: aggCur, borderColor: '#405846', backgroundColor: '#405846',
                tension: 0.3, fill: false, borderWidth: 3,
            });
            if (compare24) datasets.push({
                label: `All Groups ${prevLabel}`,
                data: aggPrev, borderColor: '#A9A9A9', backgroundColor: '#A9A9A9',
                borderDash: [5,5], borderWidth: 2, tension: 0.3, fill: false,
            });
            if (compareBudget && metric === 'sales') datasets.push({
                label: 'All Groups Budget',
                data: aggBudget, borderColor: '#6B7280', backgroundColor: 'rgba(255,255,255,0.8)',
                borderWidth: 2, tension: 0, fill: true,
            });
        }

        return { labels, datasets };
    }, [
        rawData, selectedUnits, metric, viewType, selectedYear,
        startPeriod, endPeriod, compare24, compareBudget,
        dailyStart, dailyEnd, excludeVat,
    ]);

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Loading sales data…</p>
                </div>
            </div>
        );
    }

    return (
        <div id="page-details" className={clsx('animate-in fade-in duration-500', isFullScreen && 'fullscreen-mode')}>
            {/* Header */}
            <div className="flex justify-between items-center mb-5">
                <h2 className="font-serif text-3xl font-semibold text-primary">Detailed Sales Analysis</h2>
                {isFullScreen && (
                    <button
                        onClick={() => setIsFullScreen(false)}
                        className="px-4 py-2 text-sm font-medium bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        ✕ Exit Fullscreen
                    </button>
                )}
            </div>

            {/* Filter panel */}
            <DetailsFilters
                selectedYear={selectedYear}   setSelectedYear={setSelectedYear}
                selectedUnits={selectedUnits} toggleUnit={toggleUnit}
                metric={metric}               setMetric={setMetric}
                viewType={viewType}           setViewType={setViewType}
                chartType={chartType}         setChartType={setChartType}
                startPeriod={startPeriod}     setStartPeriod={setStartPeriod}
                endPeriod={endPeriod}         setEndPeriod={setEndPeriod}
                dailyStart={dailyStart}       dailyEnd={dailyEnd}
                onDailyRangeChange={(start, end) => { setDailyStart(start); if (end) setDailyEnd(end); }}
                compare24={compare24}         setCompare24={setCompare24}
                compareBudget={compareBudget} setCompareBudget={setCompareBudget}
                excludeVat={excludeVat}       setExcludeVat={setExcludeVat}
                showLabels={showLabels}       setShowLabels={setShowLabels}
                setIsFullScreen={setIsFullScreen}
                handlePredefinedPeriod={handlePredefinedPeriod}
            />

            {/* Chart card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
                <DetailsChart
                    chartData={chartData}
                    chartType={chartType}
                    metric={metric}
                    showLabels={showLabels}
                    isFullScreen={isFullScreen}
                    selectedYear={selectedYear}
                />
            </div>

            {/* Data table */}
            <DetailsTable chartData={chartData} metric={metric} />
        </div>
    );
};

export default DashboardDetails;
