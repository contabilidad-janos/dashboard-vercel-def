import React, { useEffect, useState, useMemo } from 'react';
import { DataService, MONTHS, BUSINESS_UNITS, WEEKLY_LABELS_2025, WEEKLY_LABELS_2026, WEEK_MONTH_MAP } from '../services/dataService';
import { VAT_RATES } from '../data/SEED_DATA';
import { Title as ChartTitle, Chart } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import clsx from 'clsx';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import DetailsFilters from './details/DetailsFilters';
import DetailsChart from './details/DetailsChart';
import DetailsTable from './details/DetailsTable';

Chart.register(ChartDataLabels);

// ── Constants ──────────────────────────────────────────────────────────────────
const BU_COLORS = {
    'Juntos house': '#6E8C71',
    'Juntos boutique': '#B09B80',
    'Picadeli': '#D9825F',
    'Juntos farm shop': '#E8C89A',
    'Tasting place': '#879FA8',
    'Distribution b2b': '#566E7A',
    'Juntos Products': '#C4BFAA',
    'Activities': '#A9A9A9',
    'All Groups': '#405846',
};
const COLORS_ARRAY = Object.values(BU_COLORS);

// ── Helpers ────────────────────────────────────────────────────────────────────
const getLastWeekIndex = () => {
    const today = new Date();
    const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
    const label = `${format(lastWeekStart, 'dd/MM')}-${format(lastWeekEnd, 'dd/MM')}`;
    const idx = WEEKLY_LABELS_2025.indexOf(label);
    return idx !== -1 ? idx : WEEKLY_LABELS_2025.length - 1;
};

// ── Component ──────────────────────────────────────────────────────────────────
const DashboardDetails = () => {
    // ── State ────────────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [rawData, setRawData] = useState({});

    const [selectedYear, setSelectedYear] = useState('2025');
    const [selectedUnits, setSelectedUnits] = useState(['All Groups']);
    const [metric, setMetric] = useState('sales');
    const [viewType, setViewType] = useState('daily');
    const [chartType, setChartType] = useState('bar');

    const [dailyStart, setDailyStart] = useState('2025-12-29');
    const [dailyEnd, setDailyEnd] = useState('2026-01-04');

    const [startPeriod, setStartPeriod] = useState(() => getLastWeekIndex());
    const [endPeriod, setEndPeriod] = useState(() => getLastWeekIndex());

    const [compare24, setCompare24] = useState(true);
    const [compareBudget, setCompareBudget] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [excludeVat, setExcludeVat] = useState(false);

    // ── Computed helpers ─────────────────────────────────────────────────────
    const getNetValue = (val, unitName) => {
        if (!excludeVat || !val) return val;
        const rate = VAT_RATES[unitName] || 0;
        return val / (1 + rate);
    };

    // ── Side effects ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (viewType === 'monthly') { setStartPeriod(0); setEndPeriod(11); }
        else if (viewType === 'weekly') { const idx = getLastWeekIndex(); setStartPeriod(idx); setEndPeriod(idx); }
        else if (viewType === 'yearly') { setStartPeriod(0); setEndPeriod(1); }
    }, [viewType]);

    useEffect(() => {
        const load = async () => {
            const [
                sales25, sales25w, trans25, trans25w, spend25,
                sales24, sales24w, trans24, trans24w, spend24,
                sales26, sales26w, trans26, trans26w, spend26,
                budget25u, raw2025
            ] = await Promise.all([
                DataService.get2025SalesData(),  DataService.get2025SalesDataWeekly(),
                DataService.get2025TransData(),  DataService.get2025TransDataWeekly(),
                DataService.get2025SpendData(),
                DataService.get2024SalesData(),  DataService.get2024SalesDataWeekly(),
                DataService.get2024TransData(),  DataService.get2024TransDataWeekly(),
                DataService.get2024SpendData(),
                DataService.get2026SalesData(),  DataService.get2026SalesDataWeekly(),
                DataService.get2026TransData(),  DataService.get2026TransDataWeekly(),
                DataService.get2026SpendData(),
                DataService.get2025BudgetDataByUnit(),
                DataService.get2025RawData(),
            ]);
            setRawData({ sales25, sales25w, trans25, trans25w, spend25, sales24, sales24w, trans24, trans24w, spend24, sales26, sales26w, trans26, trans26w, spend26, budget25u, raw2025 });
            setLoading(false);
        };
        load();
    }, []);

    // ── Event handlers ───────────────────────────────────────────────────────
    const toggleUnit = (u) => {
        setSelectedUnits(prev =>
            prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]
        );
    };

    const handlePredefinedPeriod = (e) => {
        const val = e.target.value;
        if (viewType === 'monthly') {
            if (val === 'q1') { setStartPeriod(0); setEndPeriod(2); }
            else if (val === 'q2') { setStartPeriod(3); setEndPeriod(5); }
            else if (val === 'q3') { setStartPeriod(6); setEndPeriod(8); }
            else if (val === 'q4') { setStartPeriod(9); setEndPeriod(11); }
            else if (val === 'summer') { setStartPeriod(3); setEndPeriod(9); }
            else if (val === 'ytd') { setStartPeriod(0); setEndPeriod(10); }
        } else if (viewType === 'weekly') {
            if (val === 'q1') { setStartPeriod(0); setEndPeriod(12); }
            else if (val === 'q2') { setStartPeriod(13); setEndPeriod(25); }
            else if (val === 'q3') { setStartPeriod(26); setEndPeriod(38); }
            else if (val === 'q4') { setStartPeriod(39); setEndPeriod(WEEKLY_LABELS_2025.length - 1); }
        }
    };

    // ── chartData computation (memoized) ─────────────────────────────────────
    const chartData = useMemo(() => {
        if (!rawData.sales25) return null;

        // References based on selected year
        const is2026 = selectedYear === '2026';
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
        const currentBudget = rawData.budget25u;
        const labelsList    = is2026 ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025;

        // ── YEARLY VIEW ──────────────────────────────────────────────────────
        if (viewType === 'yearly') {
            const labels = ['2024', '2025'];
            const datasets = [];
            const sum = (arr) => (arr || []).reduce((s, v) => s + (v || 0), 0);

            selectedUnits.filter(u => u !== 'All Groups').forEach((unit, i) => {
                const color = COLORS_ARRAY[i % COLORS_ARRAY.length];
                let d24, d25;
                if (metric === 'sales') {
                    d24 = sum((rawData.sales24[unit] || []).map(v => getNetValue(v, unit)));
                    d25 = sum((rawData.sales25[unit] || []).map(v => getNetValue(v, unit)));
                } else if (metric === 'transactions') {
                    d24 = sum(rawData.trans24[unit]); d25 = sum(rawData.trans25[unit]);
                } else {
                    const st24 = sum(rawData.sales24[unit]), tr24 = sum(rawData.trans24[unit]);
                    const st25 = sum(rawData.sales25[unit]), tr25 = sum(rawData.trans25[unit]);
                    d24 = tr24 > 0 ? Math.round(st24 / tr24) : 0;
                    d25 = tr25 > 0 ? Math.round(st25 / tr25) : 0;
                }
                datasets.push({ label: unit, data: [d24, d25], backgroundColor: ['#A9A9A9', color], borderColor: ['#A9A9A9', color], borderWidth: 2 });
            });

            if (selectedUnits.includes('All Groups')) {
                let t24 = 0, t25 = 0;
                if (metric === 'spend') {
                    let s24 = 0, r24 = 0, s25 = 0, r25 = 0;
                    BUSINESS_UNITS.forEach(u => { s24 += sum(rawData.sales24[u]); r24 += sum(rawData.trans24[u]); s25 += sum(rawData.sales25[u]); r25 += sum(rawData.trans25[u]); });
                    t24 = r24 > 0 ? Math.round(s24 / r24) : 0; t25 = r25 > 0 ? Math.round(s25 / r25) : 0;
                } else {
                    BUSINESS_UNITS.forEach(u => {
                        const key = metric === 'sales' ? 'sales' : 'trans';
                        t24 += sum(rawData[`${key}24`][u]); t25 += sum(rawData[`${key}25`][u]);
                    });
                }
                datasets.push({ label: 'All Groups', data: [t24, t25], backgroundColor: ['#A9A9A9', '#405846'], borderColor: ['#A9A9A9', '#405846'], borderWidth: 3 });
            }
            return { labels, datasets };
        }

        // ── DAILY VIEW ───────────────────────────────────────────────────────
        if (viewType === 'daily') {
            const labels = [];
            for (let d = new Date(dailyStart); d <= new Date(dailyEnd); d.setDate(d.getDate() + 1)) {
                labels.push(d.toISOString().split('T')[0]);
            }
            const rawList = rawData.raw2025 || [];
            const getValue = (dateStr, unitName) => {
                const records = rawList.filter(r => r.date === dateStr);
                if (unitName === 'All Groups') {
                    return BUSINESS_UNITS.reduce((total, u) => {
                        const v = records.filter(r => r.business_unit === u).reduce((s, r) => s + (Number(r.revenue) || 0), 0);
                        return total + getNetValue(v, u);
                    }, 0);
                }
                const v = records.filter(r => r.business_unit === unitName).reduce((s, r) => s + (Number(r.revenue) || 0), 0);
                return getNetValue(v, unitName);
            };
            const datasets = selectedUnits.map(unit => ({
                label: unit,
                data: labels.map(date => getValue(date, unit)),
                borderColor: BU_COLORS[unit] || '#000',
                backgroundColor: BU_COLORS[unit] || '#000',
                tension: 0.3, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2,
            }));
            return { labels, datasets };
        }

        // ── MONTHLY / WEEKLY VIEW ────────────────────────────────────────────
        const labels = viewType === 'monthly'
            ? MONTHS.slice(startPeriod, endPeriod + 1)
            : labelsList.slice(startPeriod, endPeriod + 1);

        const getSlice = (dataMap, unit, isWeekly) => {
            const src = isWeekly ? dataMap[unit] : dataMap[unit];
            return (src || []).slice(startPeriod, endPeriod + 1);
        };

        const buildUnitData = (salesMap, transMap, spendMap, salesMapW, transMapW, unit) => {
            if (viewType === 'monthly') {
                if (metric === 'sales') return (salesMap[unit] || []).map(v => getNetValue(v, unit)).slice(startPeriod, endPeriod + 1);
                if (metric === 'transactions') return getSlice(transMap, unit, false);
                return getSlice(spendMap, unit, false);
            }
            if (metric === 'sales') return (salesMapW[unit] || []).map(v => getNetValue(v, unit)).slice(startPeriod, endPeriod + 1);
            if (metric === 'transactions') return getSlice(transMapW, unit, true);
            const s = salesMapW[unit] || []; const v = transMapW[unit] || [];
            return s.map((val, idx) => v[idx] > 0 ? Math.round(val / v[idx]) : 0).slice(startPeriod, endPeriod + 1);
        };

        const datasets = [];

        selectedUnits.filter(u => u !== 'All Groups').forEach((unit, i) => {
            const color = COLORS_ARRAY[i % COLORS_ARRAY.length];
            datasets.push({ label: `${unit} '${is2026 ? '26' : '25'}`, data: buildUnitData(currentSales, currentTrans, currentSpend, currentSalesW, currentTransW, unit), borderColor: color, backgroundColor: color, tension: 0.3, fill: false });

            if (compare24) {
                datasets.push({ label: `${unit} '${is2026 ? '25' : '24'}`, data: buildUnitData(prevSales, prevTrans, prevSpend, prevSalesW, prevTransW, unit), borderColor: color, backgroundColor: color, borderDash: [5, 5], borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0 });
            }

            if (compareBudget && metric === 'sales') {
                const bData = (currentBudget[unit] || []).map(v => getNetValue(v, unit));
                const budgetData = viewType === 'monthly'
                    ? bData.slice(startPeriod, endPeriod + 1)
                    : Array.from({ length: endPeriod - startPeriod + 1 }, (_, wi) => Math.round((bData[WEEK_MONTH_MAP[startPeriod + wi] || 0] || 0) / 4));
                datasets.push({ label: `${unit} Budget`, data: budgetData, borderColor: color, borderDash: [2, 2], borderWidth: 2, pointStyle: 'rectRot', tension: 0, fill: false });
            }
        });

        if (selectedUnits.includes('All Groups')) {
            const dataLen = endPeriod - startPeriod + 1;
            const aggCurrent = new Array(dataLen).fill(0);
            const aggPrev    = new Array(dataLen).fill(0);
            const aggBudget  = new Array(dataLen).fill(0);

            if (metric !== 'spend') {
                BUSINESS_UNITS.forEach(unit => {
                    buildUnitData(currentSales, currentTrans, currentSpend, currentSalesW, currentTransW, unit).forEach((v, i) => { aggCurrent[i] += v; });
                    if (compare24) buildUnitData(prevSales, prevTrans, prevSpend, prevSalesW, prevTransW, unit).forEach((v, i) => { aggPrev[i] += v; });
                    if (compareBudget && metric === 'sales') {
                        const bData = (currentBudget[unit] || []).map(v => getNetValue(v, unit));
                        const bd = viewType === 'monthly' ? bData.slice(startPeriod, endPeriod + 1) : Array.from({ length: dataLen }, (_, wi) => Math.round((bData[WEEK_MONTH_MAP[startPeriod + wi] || 0] || 0) / 4));
                        bd.forEach((v, i) => { aggBudget[i] += v; });
                    }
                });
            } else {
                for (let i = 0; i < dataLen; i++) {
                    let ps = 0, pt = 0, ps2 = 0, pt2 = 0;
                    BUSINESS_UNITS.forEach(u => {
                        const idx = startPeriod + i;
                        const [csrc, tsrc] = viewType === 'monthly' ? [currentSales[u], currentTrans[u]] : [currentSalesW[u], currentTransW[u]];
                        const [psrc, tpsrc] = viewType === 'monthly' ? [prevSales[u], prevTrans[u]] : [prevSalesW[u], prevTransW[u]];
                        ps += getNetValue(csrc?.[idx] || 0, u); pt += tsrc?.[idx] || 0;
                        ps2 += getNetValue(psrc?.[idx] || 0, u); pt2 += tpsrc?.[idx] || 0;
                    });
                    aggCurrent[i] = pt > 0 ? Math.round(ps / pt) : 0;
                    aggPrev[i]    = pt2 > 0 ? Math.round(ps2 / pt2) : 0;
                }
            }

            datasets.unshift({ label: `All Groups '${is2026 ? '26' : '25'}`, data: aggCurrent, borderColor: '#405846', backgroundColor: '#405846', tension: 0.3, fill: false, borderWidth: 3 });
            if (compare24) datasets.push({ label: `All Groups '${is2026 ? '25' : '24'}`, data: aggPrev, borderColor: '#A9A9A9', backgroundColor: '#A9A9A9', borderWidth: 2, borderDash: [5, 5], tension: 0.3, fill: false });
            if (compareBudget && metric === 'sales') datasets.push({ label: 'All Groups Budget', data: aggBudget, borderColor: '#6B7280', backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 2, tension: 0, fill: true });
        }

        return { labels, datasets };
    }, [rawData, selectedUnits, metric, viewType, startPeriod, endPeriod, compare24, compareBudget, dailyStart, dailyEnd, excludeVat, selectedYear]);

    // ── Render ───────────────────────────────────────────────────────────────
    if (loading) return <div className="text-center py-20 text-gray-500">Loading Detail Data...</div>;

    return (
        <div id="page-details" className={clsx('animate-in fade-in duration-500', isFullScreen && 'fullscreen-mode')}>
            <div className="flex justify-between items-center mb-6">
                <h2 className="font-serif text-3xl font-semibold text-primary">Detailed Sales Analysis</h2>
                {isFullScreen && (
                    <button onClick={() => setIsFullScreen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
                        Exit Fullscreen
                    </button>
                )}
            </div>

            <DetailsFilters
                selectedYear={selectedYear} setSelectedYear={setSelectedYear}
                selectedUnits={selectedUnits} toggleUnit={toggleUnit}
                metric={metric} setMetric={setMetric}
                viewType={viewType} setViewType={setViewType}
                chartType={chartType} setChartType={setChartType}
                startPeriod={startPeriod} setStartPeriod={setStartPeriod}
                endPeriod={endPeriod} setEndPeriod={setEndPeriod}
                dailyStart={dailyStart} dailyEnd={dailyEnd}
                onDailyRangeChange={(start, end) => { setDailyStart(start); if (end) setDailyEnd(end); }}
                compare24={compare24} setCompare24={setCompare24}
                compareBudget={compareBudget} setCompareBudget={setCompareBudget}
                excludeVat={excludeVat} setExcludeVat={setExcludeVat}
                showLabels={showLabels} setShowLabels={setShowLabels}
                setIsFullScreen={setIsFullScreen}
                handlePredefinedPeriod={handlePredefinedPeriod}
            />

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8">
                <DetailsChart
                    chartData={chartData}
                    chartType={chartType}
                    metric={metric}
                    showLabels={showLabels}
                    isFullScreen={isFullScreen}
                    selectedYear={selectedYear}
                />
            </div>

            <DetailsTable chartData={chartData} metric={metric} />
        </div>
    );
};

export default DashboardDetails;
