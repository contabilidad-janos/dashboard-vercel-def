import React, { useEffect, useState, useMemo } from 'react';
import { DataService, MONTHS, BUSINESS_UNITS, WEEKLY_LABELS_2025, WEEK_MONTH_MAP } from '../services/dataService';
import { Title as ChartTitle, Chart } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { formatCurrency, formatNumber } from '../utils/formatters';
import clsx from 'clsx';
import { Download, Maximize2, Tag } from 'lucide-react';
import DateRangePicker from './DateRangePicker';

// Register the datalabels plugin
Chart.register(ChartDataLabels);

// Helper to get weeks in range
const getWeeksInRange = (startM, endM, weeklyLabels) => {
    // This logic approximates weeks to months using the WEEK_MONTH_MAP
    // Find first week index with month >= startM
    const startWeek = WEEK_MONTH_MAP.findIndex(m => m >= startM);
    // Find last week index with month <= endM
    // (lastIndexOf backwards)
    let endWeek = WEEK_MONTH_MAP.length - 1;
    while (endWeek >= 0 && WEEK_MONTH_MAP[endWeek] > endM) endWeek--;

    // Slice includes start, excludes end in JS, but we want inclusive range
    return weeklyLabels.slice(startWeek, endWeek + 1);
};

import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';

// ... (imports remain)

const DashboardDetails = () => {
    const [loading, setLoading] = useState(true);
    const [rawData, setRawData] = useState({});

    // Filter States
    const [selectedUnits, setSelectedUnits] = useState(['All Groups']); // Default one
    const [metric, setMetric] = useState('sales'); // sales, transactions, spend
    const [viewType, setViewType] = useState('daily'); // Default to daily for user request

    // Daily Range State - Default to User Requested Range (Dec 29 - Jan 4)
    const [dailyStart, setDailyStart] = useState('2025-12-29');
    const [dailyEnd, setDailyEnd] = useState('2026-01-04');

    const [chartType, setChartType] = useState('bar');

    // Helper to calculate last week index
    const getLastWeekIndex = () => {
        const today = new Date();
        const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        const lastWeekEnd = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        const label = `${format(lastWeekStart, 'dd/MM')}-${format(lastWeekEnd, 'dd/MM')}`;
        const idx = WEEKLY_LABELS_2025.indexOf(label);
        return idx !== -1 ? idx : WEEKLY_LABELS_2025.length - 1;
    };

    const [startPeriod, setStartPeriod] = useState(() => getLastWeekIndex());
    const [endPeriod, setEndPeriod] = useState(() => getLastWeekIndex());

    const [compare24, setCompare24] = useState(true);
    const [compareBudget, setCompareBudget] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [isFullScreen, setIsFullScreen] = useState(false);

    useEffect(() => {
        // Reset period when view type changes
        if (viewType === 'monthly') {
            setStartPeriod(0);
            setEndPeriod(11);
        } else if (viewType === 'weekly') {
            // Default to last full week when switching to weekly
            const idx = getLastWeekIndex();
            setStartPeriod(idx);
            setEndPeriod(idx);
        } else if (viewType === 'yearly') {
            setStartPeriod(0);
            setEndPeriod(1);
        } else if (viewType === 'daily') {
            // Daily view uses dailyStart/End
        }
    }, [viewType]);

    useEffect(() => {
        const load = async () => {
            const [
                sales25, sales25w, trans25, trans25w, spend25,
                sales24, sales24w, trans24, trans24w, spend24,
                budget25u, raw2025
            ] = await Promise.all([
                DataService.get2025SalesData(),
                DataService.get2025SalesDataWeekly(),
                DataService.get2025TransData(),
                DataService.get2025TransDataWeekly(),
                DataService.get2025SpendData(),
                DataService.get2024SalesData(),
                DataService.get2024SalesDataWeekly(),
                DataService.get2024TransData(),
                DataService.get2024TransDataWeekly(),
                DataService.get2024SpendData(),
                DataService.get2025BudgetDataByUnit(),
                DataService.get2025RawData()
            ]);

            setRawData({
                sales25, sales25w, trans25, trans25w, spend25,
                sales24, sales24w, trans24, trans24w, spend24,
                budget25u, raw2025
            });
            setLoading(false);
        };
        load();
    }, []);

    // Derived Data Calculation
    const chartData = useMemo(() => {
        if (!rawData.sales25) return null;

        // Handle yearly view separately
        if (viewType === 'yearly') {
            const labels = ['2024', '2025'];
            const datasets = [];
            const colors = ['#6E8C71', '#B09B80', '#D9825F', '#E8C89A', '#879FA8', '#566E7A', '#C4BFAA', '#A9A9A9'];

            const getYearlyTotal = (data) => data ? data.reduce((sum, val) => sum + (val || 0), 0) : 0;
            const getYearlyAvg = (sales, trans) => {
                const totalSales = getYearlyTotal(sales);
                const totalTrans = getYearlyTotal(trans);
                return totalTrans > 0 ? Math.round(totalSales / totalTrans) : 0;
            };

            selectedUnits.filter(u => u !== 'All Groups').forEach((unit, i) => {
                const color = colors[i % colors.length];
                let data24, data25;

                if (metric === 'sales') {
                    data24 = getYearlyTotal(rawData.sales24[unit]);
                    data25 = getYearlyTotal(rawData.sales25[unit]);
                } else if (metric === 'transactions') {
                    data24 = getYearlyTotal(rawData.trans24[unit]);
                    data25 = getYearlyTotal(rawData.trans25[unit]);
                } else {
                    data24 = getYearlyAvg(rawData.sales24[unit], rawData.trans24[unit]);
                    data25 = getYearlyAvg(rawData.sales25[unit], rawData.trans25[unit]);
                }

                datasets.push({
                    label: unit,
                    data: [data24, data25],
                    backgroundColor: ['#A9A9A9', color], // Gray for 2024, Unit Color for 2025
                    borderColor: ['#A9A9A9', color],
                    borderWidth: 2
                });
            });

            // Handle All Groups for yearly
            if (selectedUnits.includes('All Groups')) {
                let total24 = 0, total25 = 0;
                BUSINESS_UNITS.forEach(unit => {
                    if (metric === 'sales') {
                        total24 += getYearlyTotal(rawData.sales24[unit]);
                        total25 += getYearlyTotal(rawData.sales25[unit]);
                    } else if (metric === 'transactions') {
                        total24 += getYearlyTotal(rawData.trans24[unit]);
                        total25 += getYearlyTotal(rawData.trans25[unit]);
                    } else {
                        // For spend, we need weighted average
                        total24 += getYearlyTotal(rawData.sales24[unit]);
                        total25 += getYearlyTotal(rawData.sales25[unit]);
                    }
                });

                if (metric === 'spend') {
                    let trans24 = 0, trans25 = 0;
                    BUSINESS_UNITS.forEach(unit => {
                        trans24 += getYearlyTotal(rawData.trans24[unit]);
                        trans25 += getYearlyTotal(rawData.trans25[unit]);
                    });
                    total24 = trans24 > 0 ? Math.round(total24 / trans24) : 0;
                    total25 = trans25 > 0 ? Math.round(total25 / trans25) : 0;
                }

                datasets.push({
                    label: 'All Groups',
                    data: [total24, total25],
                    backgroundColor: ['#A9A9A9', '#405846'], // Gray for 2024, Dark green for 2025
                    borderColor: ['#A9A9A9', '#405846'],
                    borderWidth: 3
                });
            }

            return { labels, datasets };
        }

        // Handle Daily View (Range)
        if (viewType === 'daily') {
            const labels = [];
            const start = new Date(dailyStart);
            const end = new Date(dailyEnd);

            // Generate Date Labels (inclusive)
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                labels.push(d.toISOString().split('T')[0]); // YYYY-MM-DD
            }

            const datasets = [];
            const rawDataList = rawData.raw2025 || [];

            // Colors for BUs
            const buColors = {
                'Juntos house': '#6E8C71',
                'Juntos boutique': '#B09B80',
                'Picadeli': '#D9825F',
                'Juntos farm shop': '#E8C89A',
                'Tasting place': '#879FA8',
                'Distribution b2b': '#566E7A',
                'Juntos Products': '#C4BFAA',
                'Activities': '#A9A9A9',
                'All Groups': '#405846'
            };

            // Helper to get value for a specific date and unit
            const getValue = (dateStr, unitName) => {
                const records = rawDataList.filter(r => r.date === dateStr);
                if (unitName === 'All Groups') {
                    return records.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0);
                } else {
                    // Match BU name (mapped or raw)
                    const val = records
                        .filter(r => r.business_unit === unitName) // Assumes normalized names in DB or exact match
                        .reduce((sum, r) => sum + (Number(r.revenue) || 0), 0);
                    return val;
                }
            };

            // Create dataset for each selected unit
            selectedUnits.forEach(unit => {
                const data = labels.map(date => getValue(date, unit));

                datasets.push({
                    label: unit,
                    data: data,
                    borderColor: buColors[unit] || '#000',
                    backgroundColor: buColors[unit] || '#000',
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2
                });
            });

            return { labels, datasets };
        }

        // Standard Monthly/Weekly Logic...
        const labels = viewType === 'monthly'
            ? MONTHS.slice(startPeriod, endPeriod + 1)
            : WEEKLY_LABELS_2025.slice(startPeriod, endPeriod + 1);

        const datasets = [];
        const colors = ['#6E8C71', '#B09B80', '#D9825F', '#E8C89A', '#879FA8', '#566E7A', '#C4BFAA', '#A9A9A9'];

        selectedUnits.filter(u => u !== 'All Groups').forEach((unit, i) => {
            const color = colors[i % colors.length];
            // 1. Core Data (2025)
            let data = [];
            if (viewType === 'monthly') {
                let src = [];
                if (metric === 'sales') src = rawData.sales25[unit];
                else if (metric === 'transactions') src = rawData.trans25[unit];
                else src = rawData.spend25[unit];

                data = src.slice(startPeriod, endPeriod + 1);
            } else {
                let src = [];
                if (metric === 'sales') src = rawData.sales25w[unit];
                else if (metric === 'transactions') src = rawData.trans25w[unit];
                else {
                    const s = rawData.sales25w[unit];
                    const v = rawData.trans25w[unit];
                    src = s.map((val, idx) => v[idx] > 0 ? Math.round(val / v[idx]) : 0);
                }
                // Direct slice for weekly now that selectors are weekly indices
                data = src.slice(startPeriod, endPeriod + 1);
            }

            datasets.push({
                label: `${unit} '25`,
                data,
                borderColor: color,
                backgroundColor: color,
                tension: 0.3,
                fill: false
            });

            // 2. Comparison 2024
            if (compare24) {
                let data24 = [];
                if (viewType === 'monthly') {
                    let src = [];
                    if (metric === 'sales') src = rawData.sales24[unit];
                    else if (metric === 'transactions') src = rawData.trans24[unit];
                    else src = rawData.spend24[unit];
                    data24 = src.slice(startPeriod, endPeriod + 1);
                } else {
                    let src = [];
                    if (metric === 'sales') src = rawData.sales24w[unit];
                    else if (metric === 'transactions') src = rawData.trans24w[unit];
                    else src = rawData.spend24w[unit];
                    data24 = src.slice(startPeriod, endPeriod + 1);
                }

                datasets.push({
                    label: `${unit} '24`,
                    data: data24,
                    borderColor: color,
                    backgroundColor: color, // Usually lighter/dashed
                    borderDash: [5, 5],
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0
                });
            }

            // 3. Comparison Budget (Monthly or Weekly extrapolated)
            if (compareBudget && metric === 'sales') {
                const bData = rawData.budget25u[unit] || [];
                let budgetData = [];

                if (viewType === 'monthly') {
                    budgetData = bData.slice(startPeriod, endPeriod + 1);
                } else {
                    // Weekly: divide monthly budget by 4 for each week
                    for (let weekIdx = startPeriod; weekIdx <= endPeriod; weekIdx++) {
                        const monthIdx = WEEK_MONTH_MAP[weekIdx] || 0;
                        const monthlyBudget = bData[monthIdx] || 0;
                        budgetData.push(Math.round(monthlyBudget / 4));
                    }
                }

                datasets.push({
                    label: `${unit} Budget`,
                    data: budgetData,
                    borderColor: color,
                    borderDash: [2, 2],
                    borderWidth: 2,
                    pointStyle: 'rectRot',
                    tension: 0,
                    fill: false
                });
            }
        });

        // Handle 'All Groups' Aggregation (Non-Daily)
        if (selectedUnits.includes('All Groups') && viewType !== 'daily') { // Exclude daily from this aggregation as it handles it internally above
            // Distinct colors for visibility (matching reference design)
            const color2025 = '#405846'; // Dark forest green for 2025
            const color2024 = '#A9A9A9'; // Light gray for 2024
            const colorBudget = '#FFFFFF'; // White fill with border for budget

            // 1. Core Data (2025) - Aggregate
            let allData = [];
            const dataLength = (endPeriod - startPeriod + 1);
            allData = new Array(dataLength).fill(0);

            BUSINESS_UNITS.forEach((unit) => {
                let unitData = [];
                if (viewType === 'monthly') {
                    let src = [];
                    if (metric === 'sales') src = rawData.sales25[unit];
                    else if (metric === 'transactions') src = rawData.trans25[unit];
                    else src = rawData.spend25[unit];
                    unitData = src.slice(startPeriod, endPeriod + 1);
                } else {
                    let src = [];
                    if (metric === 'sales') src = rawData.sales25w[unit];
                    else if (metric === 'transactions') src = rawData.trans25w[unit];
                    else {
                        const s = rawData.sales25w[unit];
                        const v = rawData.trans25w[unit];
                        src = s.map((val, idx) => v[idx] > 0 ? Math.round(val / v[idx]) : 0);
                    }
                    unitData = src.slice(startPeriod, endPeriod + 1);
                }

                // Add to total
                unitData.forEach((val, idx) => {
                    // Correct approach for Spend: Sum Total Sales / Sum Total Trans
                    if (metric !== 'spend') {
                        allData[idx] += val;
                    }
                });
            });

            // Spending Fix: Re-calculate for All Groups
            if (metric === 'spend') {
                allData = new Array(dataLength).fill(0);
                for (let i = 0; i < dataLength; i++) {
                    let PERIOD_SALES = 0;
                    let PERIOD_TRANS = 0;
                    BUSINESS_UNITS.forEach(unit => {
                        const idx = startPeriod + i; // Same logic for monthly/weekly now
                        if (viewType === 'monthly') {
                            PERIOD_SALES += rawData.sales25[unit][idx] || 0;
                            PERIOD_TRANS += rawData.trans25[unit][idx] || 0;
                        } else {
                            PERIOD_SALES += rawData.sales25w[unit][idx] || 0;
                            PERIOD_TRANS += rawData.trans25w[unit][idx] || 0;
                        }
                    });
                    allData[i] = PERIOD_TRANS > 0 ? Math.round(PERIOD_SALES / PERIOD_TRANS) : 0;
                }
            }

            datasets.unshift({ // Add to front
                label: `All Groups '25`,
                data: allData,
                borderColor: color2025,
                backgroundColor: color2025,
                tension: 0.3,
                fill: false,
                borderWidth: 3
            });

            // 2. Comparison 2024 - Aggregate
            if (compare24) {
                let allData24 = new Array(dataLength).fill(0);

                if (metric !== 'spend') {
                    BUSINESS_UNITS.forEach(unit => {
                        let unitData = [];
                        if (viewType === 'monthly') {
                            let src = [];
                            if (metric === 'sales') src = rawData.sales24[unit];
                            else if (metric === 'transactions') src = rawData.trans24[unit];
                            unitData = src.slice(startPeriod, endPeriod + 1);
                        } else {
                            let src = [];
                            if (metric === 'sales') src = rawData.sales24w[unit];
                            else if (metric === 'transactions') src = rawData.trans24w[unit];
                            unitData = src.slice(startPeriod, endPeriod + 1);
                        }
                        unitData.forEach((val, i) => allData24[i] += val);
                    });
                } else {
                    // Recalc Spend 24
                    for (let i = 0; i < dataLength; i++) {
                        let PERIOD_SALES = 0;
                        let PERIOD_TRANS = 0;
                        BUSINESS_UNITS.forEach(unit => {
                            const idx = startPeriod + i;
                            if (viewType === 'monthly') {
                                PERIOD_SALES += rawData.sales24[unit][idx] || 0;
                                PERIOD_TRANS += rawData.trans24[unit][idx] || 0;
                            } else {
                                PERIOD_SALES += rawData.sales24w[unit][idx] || 0;
                                PERIOD_TRANS += rawData.trans24w[unit][idx] || 0;
                            }
                        });
                        allData24[i] = PERIOD_TRANS > 0 ? Math.round(PERIOD_SALES / PERIOD_TRANS) : 0;
                    }
                }

                datasets.push({
                    label: `All Groups '24`,
                    data: allData24,
                    borderColor: color2024,
                    backgroundColor: color2024,
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false
                });
            }

            // 3. All Groups Budget Aggregation
            if (compareBudget && metric === 'sales') {
                const allBudget = new Array(dataLength).fill(0);

                BUSINESS_UNITS.forEach(unit => {
                    const bData = rawData.budget25u[unit] || [];

                    if (viewType === 'monthly') {
                        for (let i = startPeriod; i <= endPeriod; i++) {
                            allBudget[i - startPeriod] += bData[i] || 0;
                        }
                    } else {
                        // Weekly: sum monthly budgets / 4 for each week
                        for (let weekIdx = startPeriod; weekIdx <= endPeriod; weekIdx++) {
                            const monthIdx = WEEK_MONTH_MAP[weekIdx] || 0;
                            const weeklyBudget = Math.round((bData[monthIdx] || 0) / 4);
                            allBudget[weekIdx - startPeriod] += weeklyBudget;
                        }
                    }
                });

                datasets.push({
                    label: 'All Groups Budget',
                    data: allBudget,
                    borderColor: '#6B7280', // Gray border
                    backgroundColor: 'rgba(255, 255, 255, 0.9)', // White/hollow fill
                    borderWidth: 2,
                    tension: 0,
                    fill: true
                });
            }
        }

        return { labels, datasets };
    }, [rawData, selectedUnits, metric, viewType, startPeriod, endPeriod, compare24, compareBudget, dailyStart, dailyEnd]);

    const toggleUnit = (u) => {
        if (selectedUnits.includes(u)) {
            setSelectedUnits(selectedUnits.filter(x => x !== u));
        } else {
            setSelectedUnits([...selectedUnits, u]);
        }
    };

    const handlePredefinedPeriod = (e) => {
        const val = e.target.value;
        if (viewType === 'monthly') {
            if (val === 'q1') { setStartPeriod(0); setEndPeriod(2); }
            else if (val === 'q2') { setStartPeriod(3); setEndPeriod(5); }
            else if (val === 'q3') { setStartPeriod(6); setEndPeriod(8); }
            else if (val === 'q4') { setStartPeriod(9); setEndPeriod(11); }
            else if (val === 'summer') { setStartPeriod(3); setEndPeriod(9); } // Apr-Oct
            else if (val === 'ytd') { setStartPeriod(0); setEndPeriod(10); } // Nov
            // Q4/Winter logic now valid with Dec included
        } else if (viewType === 'weekly') {
            // Mapping for weeks (Appx)
            if (val === 'q1') { setStartPeriod(0); setEndPeriod(12); }
            else if (val === 'q2') { setStartPeriod(13); setEndPeriod(25); }
            else if (val === 'q3') { setStartPeriod(26); setEndPeriod(38); }
            else if (val === 'q4') { setStartPeriod(39); setEndPeriod(WEEKLY_LABELS_2025.length - 1); }
        }
        // No predefined periods for daily or yearly
    };

    if (loading) return <div className="text-center py-20 text-gray-500">Loading Detail Data...</div>;

    return (
        <div id="page-details" className={clsx("animate-in fade-in duration-500", isFullScreen && "fullscreen-mode")}>
            <div className="flex justify-between items-center mb-6">
                <h2 className="font-serif text-3xl font-semibold text-primary">Detailed Sales Analysis</h2>
                {isFullScreen && <button onClick={() => setIsFullScreen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Exit Fullscreen</button>}
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8 relative">
                {/* Chip Selector */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Tag className="w-4 h-4 text-primary" />
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Business Units</label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {/* All Groups Option */}
                        <div
                            onClick={() => toggleUnit('All Groups')}
                            className={clsx("bu-chip bg-gray-200 border-gray-300 text-gray-800 font-semibold", selectedUnits.includes('All Groups') && "active bg-primary text-white border-primary")}
                        >
                            All Groups
                        </div>
                        {BUSINESS_UNITS.map(u => (
                            <div
                                key={u}
                                onClick={() => toggleUnit(u)}
                                className={clsx("bu-chip", selectedUnits.includes(u) && "active")}
                            >
                                {u}
                            </div>
                        ))}
                    </div>    </div>

                <hr className="border-gray-100 mb-6" />

                {/* Controls */}
                <div className="flex flex-col lg:flex-row gap-4 mb-6 flex-wrap">
                    <select value={metric} onChange={e => setMetric(e.target.value)} className="bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2 focus:ring-accent" disabled={viewType === 'daily'}>
                        <option value="sales">Total Sales (€)</option>
                        <option value="transactions" disabled={viewType === 'daily'}>Volume (Pax/Tickets/Orders)</option>
                        <option value="spend" disabled={viewType === 'daily'}>Average Spend (€)</option>
                    </select>

                    <select value={viewType} onChange={e => setViewType(e.target.value)} className="bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2 focus:ring-accent">
                        <option value="monthly">Monthly View</option>
                        <option value="weekly">Weekly View</option>
                        <option value="yearly">Yearly View</option>
                        <option value="daily">Daily View</option>
                    </select>

                    {viewType !== 'yearly' && viewType !== 'daily' && (
                        <select onChange={handlePredefinedPeriod} className="bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2 focus:ring-accent">
                            <option value="custom">Custom Period</option>
                            <option value="q1">Q1 (Jan-Mar)</option>
                            <option value="q2">Q2 (Apr-Jun)</option>
                            <option value="q3">Q3 (Jul-Sep)</option>
                            <option value="q4">Q4 (Oct-Dec)</option>
                            <option value="summer">Summer Season</option>
                            <option value="ytd">YTD</option>
                        </select>
                    )}

                    <select value={chartType} onChange={e => setChartType(e.target.value)} className="bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2 focus:ring-accent">
                        <option value="line">Line Chart</option>
                        <option value="bar">Bar Chart</option>
                    </select>

                    {/* Period Range - hidden for yearly/daily view */}
                    {(viewType !== 'yearly' && viewType !== 'daily') && (
                        <div className="flex items-center gap-2">
                            <select value={startPeriod} onChange={e => setStartPeriod(Number(e.target.value))} className="bg-white border border-gray-300 rounded px-2 py-2 text-sm max-w-[120px]">
                                {viewType === 'monthly'
                                    ? MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)
                                    : WEEKLY_LABELS_2025.map((w, i) => <option key={i} value={i}>{w}</option>)
                                }
                            </select>
                            <span>-</span>
                            <select value={endPeriod} onChange={e => setEndPeriod(Number(e.target.value))} className="bg-white border border-gray-300 rounded px-2 py-2 text-sm max-w-[120px]">
                                {viewType === 'monthly'
                                    ? MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)
                                    : WEEKLY_LABELS_2025.map((w, i) => <option key={i} value={i}>{w}</option>)
                                }
                            </select>
                        </div>
                    )}

                    {/* Date Picker for Daily View */}
                    {viewType === 'daily' && (
                        <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                            <DateRangePicker
                                startDate={dailyStart}
                                endDate={dailyEnd}
                                onChange={(start, end) => {
                                    setDailyStart(start);
                                    if (end) setDailyEnd(end);
                                }}
                            />
                        </div>
                    )}


                    <div className="flex items-center gap-4 ml-auto">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={compare24} onChange={e => setCompare24(e.target.checked)} className="rounded text-accent" disabled={viewType === 'daily'} />
                            <span className={clsx("text-sm font-medium", viewType === 'daily' ? "text-gray-400" : "text-gray-700")}>vs '24</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={compareBudget} onChange={e => setCompareBudget(e.target.checked)} className="rounded text-accent" disabled={viewType === 'yearly' || metric !== 'sales' || viewType === 'daily'} />
                            <span className={clsx("text-sm font-medium", (viewType === 'yearly' || metric !== 'sales' || viewType === 'daily') ? "text-gray-400" : "text-gray-700")}>vs Bud.</span>
                        </label>
                        <button
                            onClick={() => setShowLabels(!showLabels)}
                            className={clsx("p-2 rounded-lg transition-colors", showLabels ? "bg-primary text-white" : "text-gray-400 hover:text-primary hover:bg-gray-50")}
                            title="Toggle Value Labels"
                        >
                            <Tag className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setIsFullScreen(true)}
                            className="p-2 text-gray-400 hover:text-primary hover:bg-gray-50 rounded-lg transition-colors"
                            title="Fullscreen Mode"
                        >
                            <Maximize2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Chart Area */}
                <div className={clsx("relative w-full", isFullScreen ? "h-[70vh]" : "h-[450px]")}>
                    {chartType === 'line' ? (
                        <Line
                            data={chartData}
                            options={{
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { position: 'bottom' },
                                    datalabels: {
                                        display: showLabels,
                                        align: 'top',
                                        formatter: (val) => metric === 'transactions' ? formatNumber(val) : formatCurrency(val)
                                    }
                                },
                                scales: {
                                    y: {
                                        ticks: { callback: (val) => metric === 'transactions' ? val : formatCurrency(val) }
                                    }
                                }
                            }}
                        />
                    ) : (
                        <Bar
                            data={chartData}
                            options={{
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { position: 'bottom' },
                                    datalabels: {
                                        display: showLabels,
                                        anchor: 'end',
                                        align: 'top',
                                        font: { size: 11, weight: 'bold' },
                                        color: '#374151',
                                        formatter: (value, context) => {
                                            if (!value) return '';
                                            const label = context.dataset.label || '';
                                            const formattedValue = metric === 'transactions'
                                                ? formatNumber(value)
                                                : formatCurrency(value);

                                            // Calculate percentage variations for 2025 data
                                            if (label.includes("'25") || label === 'All Groups' || (viewType === 'daily')) {
                                                const datasets = context.chart.data.datasets;
                                                const idx = context.dataIndex;
                                                let lines = [formattedValue];

                                                // Only show comparisons for non-daily views
                                                if (viewType !== 'daily') {
                                                    // Find corresponding 2024 value
                                                    const ds24 = datasets.find(d => d.label?.includes("'24"));
                                                    if (ds24 && ds24.data[idx]) {
                                                        const val24 = ds24.data[idx];
                                                        const pctChange = Math.round(((value - val24) / val24) * 100);
                                                        const sign = pctChange >= 0 ? '+' : '';
                                                        lines.push(`vs '24: ${sign}${pctChange}%`);
                                                    }

                                                    // Find corresponding Budget value
                                                    const dsBud = datasets.find(d => d.label?.includes('Budget'));
                                                    if (dsBud && dsBud.data[idx]) {
                                                        const valBud = dsBud.data[idx];
                                                        const pctBud = Math.round(((value - valBud) / valBud) * 100);
                                                        const sign = pctBud >= 0 ? '+' : '';
                                                        lines.push(`vs Bud: ${sign}${pctBud}%`);
                                                    }
                                                }

                                                return lines;
                                            }
                                            return formattedValue;
                                        }
                                    }
                                },
                                scales: {
                                    y: {
                                        ticks: { callback: (val) => metric === 'transactions' ? val : formatCurrency(val) }
                                    }
                                }
                            }}
                        />
                    )}
                </div>

                {/* CSV Button */}
                <div className="text-right mt-4">
                    <button
                        onClick={() => {
                            if (!chartData) return;
                            // Construct CSV
                            const header = ['Label', ...chartData.datasets.map(d => d.label)].join(',');
                            const rows = chartData.labels.map((lbl, i) => {
                                const rowData = chartData.datasets.map(d => d.data[i] || 0);
                                return [lbl, ...rowData].join(',');
                            });
                            const csvContent = "data:text/csv;charset=utf-8," + [header, ...rows].join('\n');
                            const encodedUri = encodeURI(csvContent);
                            const link = document.createElement("a");
                            link.setAttribute("href", encodedUri);
                            link.setAttribute("download", `sales_data_details_${new Date().toISOString().slice(0, 10)}.csv`);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }}
                        className="bg-primary hover:bg-opacity-90 text-white font-medium py-2 px-4 rounded inline-flex items-center transition cursor-pointer"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Download Data (CSV)
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
                <h3 className="text-xl font-serif text-primary mb-4">Data Breakdown</h3>
                {chartData && chartData.datasets.length > 0 ? (
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                            <tr>
                                <th className="py-3 px-4">Metric / Unit</th>
                                {chartData.labels.map((label, i) => (
                                    <th key={i} className="py-3 px-4 whitespace-nowrap">{label}</th>
                                ))}
                                <th className="py-3 px-4 font-bold">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {chartData.datasets.map((dataset, i) => {
                                const rowTotal = dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
                                return (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="py-3 px-4 font-medium text-gray-800 flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: dataset.borderColor || dataset.backgroundColor }}></span>
                                            {dataset.label}
                                        </td>
                                        {dataset.data.map((val, idx) => (
                                            <td key={idx} className="py-3 px-4">
                                                {metric === 'transactions' ? formatNumber(val) : formatCurrency(val)}
                                            </td>
                                        ))}
                                        <td className="py-3 px-4 font-bold">
                                            {metric === 'transactions' ? formatNumber(rowTotal) : formatCurrency(rowTotal)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="text-gray-500 italic py-8 text-center">Select units to view data.</div>
                )}
            </div>

        </div>
    );
};

export default DashboardDetails;
