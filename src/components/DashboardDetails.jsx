import React, { useState, useEffect, useMemo } from 'react';
import { DataService, MONTHS, WEEKLY_LABELS_2025, WEEKLY_LABELS_2026, CHART_COLORS, BUSINESS_UNITS } from '../services/dataService';
import { VAT_RATES } from '../data/SEED_DATA';
import DetailsFilters from './details/DetailsFilters';
import DetailsChart from './details/DetailsChart';
import DetailsTable from './details/DetailsTable';
import KPICard from './KPICard';
import { formatCurrency, formatNumber } from '../utils/formatters';

const DashboardDetails = () => {
    // ── STATE ─────────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);

    const [filters, setFilters] = useState({
        viewMode: 'monthly',
        metric: 'sales',
        chartType: 'bar',
        selectedYear: '2026',
        selectedMonth: new Date().getMonth() + 1, // Default current month
        selectedWeek: 1,
        // Calculate the last 7 days by default (up to yesterday to ensure data is likely present)
        dateRange: {
            from: new Date(new Date().setDate(new Date().getDate() - 7)),
            to: new Date(new Date().setDate(new Date().getDate() - 1))
        },
        includeVat: false,
        compare2024: false, // For 2025
        compare2025: false, // For 2026
        compareBudget: false,
        selectedUnits: ['All Units'],
    });

    const [raw2025, setRaw2025] = useState([]);
    const [raw2026, setRaw2026] = useState([]);
    const [fullData, setFullData] = useState(null);

    // ── DATA FETCHING ─────────────────────────────────────────────────────
    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);

            // Fetch structured aggregated data
            const [
                s26, t26, sp26, s26w, t26w, b26,
                s25, t25, sp25, s25w, t25w, b25,
                s24, t24, sp24, s24w, t24w,
                raw25, raw26
            ] = await Promise.all([
                DataService.get2026SalesData(), DataService.get2026TransData(), DataService.get2026SpendData(), DataService.get2026SalesDataWeekly(), DataService.get2026TransDataWeekly(), DataService.get2026BudgetData(),
                DataService.get2025SalesData(), DataService.get2025TransData(), DataService.get2025SpendData(), DataService.get2025SalesDataWeekly(), DataService.get2025TransDataWeekly(), DataService.get2025BudgetData(),
                DataService.get2024SalesData(), DataService.get2024TransData(), DataService.get2024SpendData(), DataService.get2024SalesDataWeekly(), DataService.get2024TransDataWeekly(),
                DataService.get2025RawData(), DataService.get2026RawData()
            ]);

            setFullData({
                '2026': { sales: s26, transactions: t26, spend: sp26, budget: b26, weeklySales: s26w, weeklyTransactions: t26w },
                '2025': { sales: s25, transactions: t25, spend: sp25, budget: b25, weeklySales: s25w, weeklyTransactions: t25w },
                '2024': { sales: s24, transactions: t24, spend: sp24, weeklySales: s24w, weeklyTransactions: t24w }
            });
            setRaw2025(raw25);
            setRaw2026(raw26);
            setLoading(false);
        };
        fetchAll();
    }, []);

    // ── HELPER: VAT Display ───────────────────────────────────────────────
    const getDisplayValue = (val, unitName) => {
        if (!filters.includeVat || filters.metric === 'transactions') return val;
        const rate = VAT_RATES[unitName] || 0;
        return val * (1 + rate);
    };

    // ── DATA PROCESSING MEMO ──────────────────────────────────────────────
    const processedData = useMemo(() => {
        if (!fullData) return null;

        const { viewMode, metric, selectedYear, selectedUnits, compare2024, compare2025, compareBudget, dateRange } = filters;
        const yearData = fullData[selectedYear];

        let result = {
            labels: [],
            datasets: [],
            unitTotals: {},
            totalValue: 0,
            tableData: []
        };

        const activeUnits = selectedUnits.includes('All Units') ? BUSINESS_UNITS : BUSINESS_UNITS.filter(u => selectedUnits.includes(u));
        let baseMetricData;

        // --- DAILY VIEW LOGIC ---
        if (viewMode === 'daily') {
            const rawData = selectedYear === '2026' ? raw2026 : raw2025;
            const start = dateRange?.from ? new Date(dateRange.from) : new Date(`${selectedYear}-01-01`);
            const end = dateRange?.to ? new Date(dateRange.to) : new Date(`${selectedYear}-12-31`);

            // Normalize time for comparison
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);

            // 1. Generate array of dates between start and end
            const dateLabels = [];
            const currentDate = new Date(start);
            while (currentDate <= end) {
                dateLabels.push(currentDate.toISOString().split('T')[0]);
                currentDate.setDate(currentDate.getDate() + 1);
            }
            result.labels = dateLabels;

            const daysCount = dateLabels.length || 1;

            // 2. Aggregate data per day and unit
            const dailyData = {};
            activeUnits.forEach(u => { dailyData[u] = Array(dateLabels.length).fill(0); });
            let totalVal = 0;

            rawData.forEach(row => {
                if (!row.date) return;
                const rowDate = row.date.split('T')[0];
                const dIdx = dateLabels.indexOf(rowDate);
                if (dIdx === -1) return;

                const uName = row.business_unit;
                if (activeUnits.includes(uName)) {
                    const rowVal = metric === 'transactions' ? Number(row.VOLUME || 0) : Number(row.revenue || 0);
                    const finalVal = getDisplayValue(rowVal, uName);
                    dailyData[uName][dIdx] += finalVal;
                    totalVal += finalVal;
                }
            });

            // 3. Build Datasets
            activeUnits.forEach((uName, idx) => {
                const totalUnit = dailyData[uName].reduce((a, b) => a + b, 0);
                result.unitTotals[uName] = totalUnit;

                result.datasets.push({
                    label: uName,
                    data: dailyData[uName],
                    backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                    borderColor: CHART_COLORS[idx % CHART_COLORS.length],
                    stack: 'Stack 0'
                });
            });

            result.totalValue = totalVal;

            // --- Comparisons for Daily View ---
            if (compare2024 && selectedYear === '2025') {
                const rawPrev = fullData['2024'].sales; // Can't easily do daily past year without raw 2024. For now, daily comparison might be limited if raw2024 isn't loaded. 
                // As a fallback or if we had raw2024:
                // Since we only have raw2025 and 2026 mostly, we will try our best or skip.
                // Assuming raw2024 is not available, we skip or use monthly average divided by days.
                // To do it properly, we need to load raw 2024 or restrict comparisons.
            }

            if (compare2025 && selectedYear === '2026') {
                // We have raw2025
                const prevDailyData = Array(dateLabels.length).fill(0);

                raw2025.forEach(row => {
                    if (!row.date) return;
                    // Map 2025 date to 2026 date by adding 1 year
                    const d25 = new Date(row.date);
                    const d26 = new Date(d25.getFullYear() + 1, d25.getMonth(), d25.getDate());
                    const d26Str = d26.toISOString().split('T')[0];
                    const dIdx = dateLabels.indexOf(d26Str);

                    if (dIdx !== -1 && activeUnits.includes(row.business_unit)) {
                        const rowVal = metric === 'transactions' ? Number(row.VOLUME || 0) : Number(row.revenue || 0);
                        prevDailyData[dIdx] += getDisplayValue(rowVal, row.business_unit);
                    }
                });

                result.datasets.push({
                    type: 'line',
                    label: '2025 (Same Days)',
                    data: prevDailyData,
                    borderColor: '#9CA3AF',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1
                });
            }

            if (compareBudget && selectedYear === '2026') {
                // Calculate average budget per day for the selected period
                const bgDaily = Array(dateLabels.length).fill(0);

                dateLabels.forEach((dStr, idx) => {
                    const d = new Date(dStr);
                    const m = d.getMonth();
                    const daysInMonth = new Date(d.getFullYear(), m + 1, 0).getDate();

                    let dayBgTotal = 0;
                    activeUnits.forEach(uName => {
                        const mBudget = yearData.budget?.[uName]?.[m] || 0;
                        dayBgTotal += getDisplayValue(mBudget, uName) / daysInMonth;
                    });
                    bgDaily[idx] = dayBgTotal;
                });

                result.datasets.push({
                    label: 'Budget (Daily Avg)',
                    data: bgDaily,
                    borderColor: '#4A5568',
                    backgroundColor: 'rgba(74, 85, 104, 0.2)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    order: -1
                });
            }


            // 4. Build Table Context
            result.tableData = dateLabels.map((date, idx) => {
                const row = { period: date };
                activeUnits.forEach(u => { row[u] = dailyData[u][idx]; });
                row.total = activeUnits.reduce((sum, u) => sum + dailyData[u][idx], 0);

                if (compare2025 && selectedYear === '2026') {
                    // Find matching 2025 day
                    const dIdx = dateLabels.indexOf(date);
                    if (dIdx !== -1 && result.datasets.find(ds => ds.label === '2025 (Same Days)')) {
                        row.prevYear = result.datasets.find(ds => ds.label === '2025 (Same Days)').data[dIdx];
                    }
                }
                return row;
            });

            return result;
        }


        // --- MONTHLY OR WEEKLY LOGIC (Existing structure roughly) ---
        if (viewMode === 'monthly') {
            result.labels = MONTHS;
            baseMetricData = metric === 'sales' ? yearData.sales : (metric === 'transactions' ? yearData.transactions : yearData.spend);
        } else {
            // WEEKLY
            result.labels = selectedYear === '2026' ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025;
            baseMetricData = metric === 'sales' ? yearData.weeklySales : (metric === 'transactions' ? yearData.weeklyTransactions : {});
        }

        let totalVal = 0;

        activeUnits.forEach((uName, idx) => {
            const rawArr = baseMetricData[uName] || [];
            const processedArr = rawArr.map(v => getDisplayValue(v, uName));

            const totalUnit = processedArr.reduce((a, b) => a + b, 0);
            result.unitTotals[uName] = totalUnit;
            totalVal += totalUnit;

            result.datasets.push({
                label: uName,
                data: processedArr,
                backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                borderColor: CHART_COLORS[idx % CHART_COLORS.length],
                stack: 'Stack 0',
            });
        });

        result.totalValue = totalVal;

        // COMPARISONS (Monthly/Weekly)
        if (compare2024 && selectedYear === '2025') {
            const prevDataPath = viewMode === 'monthly' ? fullData['2024'].sales : fullData['2024'].weeklySales;
            const prevAggregated = result.labels.map((_, i) =>
                activeUnits.reduce((sum, u) => sum + getDisplayValue((prevDataPath?.[u]?.[i] || 0), u), 0)
            );
            result.datasets.push({
                type: 'line', label: '2024', data: prevAggregated, borderColor: '#9CA3AF', borderDash: [5, 5], fill: false, tension: 0.1
            });
        }

        if (compare2025 && selectedYear === '2026') {
            const prevDataPath = viewMode === 'monthly' ? fullData['2025'].sales : fullData['2025'].weeklySales;
            const prevAggregated = result.labels.map((_, i) =>
                activeUnits.reduce((sum, u) => sum + getDisplayValue((prevDataPath?.[u]?.[i] || 0), u), 0)
            );
            result.datasets.push({
                type: 'line', label: '2025', data: prevAggregated, borderColor: '#9CA3AF', borderDash: [5, 5], fill: false, tension: 0.1
            });
        }

        if (compareBudget && metric === 'sales') {
            if (viewMode === 'monthly') {
                const bgAggregated = MONTHS.map((_, i) =>
                    activeUnits.reduce((sum, u) => sum + getDisplayValue((yearData.budget?.[u]?.[i] || 0), u), 0)
                );
                result.datasets.push({
                    label: 'Budget', data: bgAggregated, borderColor: '#4A5568', borderWidth: 2, fill: false, tension: 0.1, order: -1
                });
            } else if (viewMode === 'weekly') {
                // Approximate weekly budget
                const bgAggregated = result.labels.map((_, i) => {
                    const m = Math.floor(i / 4.33); // Rough month approx
                    return activeUnits.reduce((sum, u) => sum + getDisplayValue((yearData.budget?.[u]?.[m] || 0) / 4.33, u), 0);
                });
                result.datasets.push({
                    label: 'Budget (Approx)', data: bgAggregated, borderColor: '#4A5568', borderWidth: 2, fill: false, tension: 0.1, order: -1
                });
            }
        }

        // Table Data (Monthly/Weekly)
        result.tableData = result.labels.map((label, i) => {
            const row = { period: label };
            activeUnits.forEach(u => {
                row[u] = getDisplayValue((baseMetricData[u]?.[i] || 0), u);
            });
            row.total = activeUnits.reduce((sum, u) => sum + (row[u] || 0), 0);

            if (compare2025 && selectedYear === '2026') {
                const prevDataPath = viewMode === 'monthly' ? fullData['2025'].sales : fullData['2025'].weeklySales;
                row.prevYear = activeUnits.reduce((sum, u) => sum + getDisplayValue((prevDataPath?.[u]?.[i] || 0), u), 0);
            }
            if (compare2024 && selectedYear === '2025') {
                const prevDataPath = viewMode === 'monthly' ? fullData['2024'].sales : fullData['2024'].weeklySales;
                row.prevYear = activeUnits.reduce((sum, u) => sum + getDisplayValue((prevDataPath?.[u]?.[i] || 0), u), 0);
            }
            if (compareBudget && metric === 'sales') {
                if (viewMode === 'monthly') {
                    row.budget = activeUnits.reduce((sum, u) => sum + getDisplayValue((yearData.budget?.[u]?.[i] || 0), u), 0);
                } else if (viewMode === 'weekly') {
                    const m = Math.floor(i / 4.33);
                    row.budget = activeUnits.reduce((sum, u) => sum + getDisplayValue((yearData.budget?.[u]?.[m] || 0) / 4.33, u), 0);
                }
            }
            return row;
        });

        return result;

    }, [fullData, filters, raw2025, raw2026]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    if (loading || !processedData) {
        return <div className="text-center py-20 text-gray-500">Processing Complex Data...</div>;
    }

    const { viewMode, metric, selectedYear, chartType } = filters;
    const isSales = metric === 'sales';

    return (
        <div className="space-y-6">

            {/* KPI OVERVIEW (Top Row) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPICard
                    title={`Total ${metric === 'sales' ? 'Revenue' : (metric === 'transactions' ? 'Volume' : 'Avg Spend')}`}
                    value={isSales || metric === 'spend' ? formatCurrency(processedData.totalValue) : formatNumber(processedData.totalValue)}
                    subtext={`${selectedYear} | ${filters.selectedUnits.includes('All Units') ? 'All Units' : filters.selectedUnits.join(', ')}`}
                />
                {filters.compare2025 && selectedYear === '2026' && (
                    <KPICard
                        title="vs. 2025 Total"
                        value={(() => {
                            const current = processedData.totalValue;
                            const prev = processedData.tableData.reduce((sum, row) => sum + (row.prevYear || 0), 0);
                            if (!prev) return 'N/A';
                            const diff = current - prev;
                            const pct = ((diff / prev) * 100).toFixed(1);
                            return `${diff > 0 ? '+' : ''}${pct}%`;
                        })()}
                        subtext="Year-over-Year Growth"
                        color={processedData.totalValue >= processedData.tableData.reduce((sum, row) => sum + (row.prevYear || 0), 0) ? 'text-green-600' : 'text-red-500'}
                    />
                )}
                {filters.compareBudget && (
                    <KPICard
                        title="vs. Budget"
                        value={(() => {
                            const current = processedData.totalValue;
                            const budget = processedData.tableData.reduce((sum, row) => sum + (row.budget || 0), 0);
                            if (!budget) return 'N/A';
                            const diff = current - budget;
                            const pct = ((diff / budget) * 100).toFixed(1);
                            return `${diff > 0 ? '+' : ''}${pct}%`;
                        })()}
                        subtext="Performance vs Target"
                        color={processedData.totalValue >= processedData.tableData.reduce((sum, row) => sum + (row.budget || 0), 0) ? 'text-green-600' : 'text-red-500'}
                    />
                )}
            </div>

            {/* FILTERS SECTION */}
            <DetailsFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                businessUnits={BUSINESS_UNITS}
            />

            {/* CHART SECTION */}
            <DetailsChart
                chartData={processedData}
                filters={filters}
                metric={metric}
                chartType={chartType}
            />

            {/* DATA TABLE */}
            <DetailsTable
                tableData={processedData.tableData}
                activeUnits={filters.selectedUnits.includes('All Units') ? BUSINESS_UNITS : filters.selectedUnits}
                metric={metric}
                comparePrevYear={(filters.compare2024 && selectedYear === '2025') || (filters.compare2025 && selectedYear === '2026')}
                compareBudget={filters.compareBudget}
            />

        </div>
    );
};

export default DashboardDetails;
