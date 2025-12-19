import React, { useEffect, useState } from 'react';
import { DataService, MONTHS, CHART_COLORS } from '../services/dataService';
import KPICard from './KPICard';
import YearlyBarChart from './YearlyBarChart';
import YearlyPieChart from './YearlyPieChart';
import SpendEvolutionChart from './SpendEvolutionChart';
import { formatCurrency, formatNumber } from '../utils/formatters';

const Dashboard2024 = () => {
    const [loading, setLoading] = useState(true);
    const [salesData, setSalesData] = useState(null);
    const [transData, setTransData] = useState(null);
    const [spendData, setSpendData] = useState(null);
    const [businessUnits, setBusinessUnits] = useState([]);
    const [selectedUnit, setSelectedUnit] = useState('all');

    const [kpis, setKpis] = useState({
        totalSales: 0,
        bestMonth: { name: '-', value: 0 },
        worstMonth: { name: '-', value: 0 },
        avgMonthlySales: 0,
        avgSpend: 0,
        totalTransactions: 0
    });

    const [chartData, setChartData] = useState({
        barDatasets: [],
        pieLabels: [],
        pieData: [],
        spendDatasets: []
    });

    useEffect(() => {
        const fetchData = async () => {
            const units = await DataService.getBusinessUnits();
            const sales = await DataService.get2024SalesData();
            const trans = await DataService.get2024TransData();
            const spend = await DataService.get2024SpendData();

            setBusinessUnits(units);
            setSalesData(sales);
            setTransData(trans);
            setSpendData(spend);
            setLoading(false);
        };

        fetchData();
    }, []);

    useEffect(() => {
        if (!salesData || !businessUnits.length) return;
        updateView(selectedUnit);
    }, [selectedUnit, salesData, businessUnits]);

    const updateView = (unit) => {
        let currentSales = [];
        let currentTrans = [];
        let currentSpend = []; // Monthly Average Spend array

        if (unit === 'all') {
            currentSales = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + (salesData[b.name][i] || 0), 0));
            currentTrans = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + (transData[b.name][i] || 0), 0));
            // For 'all', aggregate spend is Avg(Total Sales / Total Trans) or similar.
            // Reference logic: "Avg Spend (Group) ... totalTransactionsGroup > 0 ? totalSales / totalTransactionsGroup : 0"
            // But for the Chart, it's monthly.
            currentSpend = MONTHS.map((_, i) => {
                const tSales = currentSales[i];
                const tTrans = currentTrans[i];
                return tTrans > 0 ? Math.round(tSales / tTrans) : 0;
            });
        } else {
            currentSales = salesData[unit] || [];
            currentTrans = transData[unit] || [];
            currentSpend = spendData[unit] || [];
        }

        // KPIs
        const totalSales = currentSales.reduce((a, b) => a + b, 0);
        const totalTrans = currentTrans.reduce((a, b) => a + b, 0);
        const avgMonthlySales = totalSales / MONTHS.length;

        // Filter out 0s for Min calculation if we want "Actual" min (assuming 0 might be future/missing), 
        // but for 2024 (past year) 0 is likely real or missing data. 2024 is full year presumably.
        // Reference says: "Math.min(...monthlyTotalsGroup.filter(v => v > 0))"
        const nonZeroSales = currentSales.filter(v => v > 0);
        const minSales = nonZeroSales.length > 0 ? Math.min(...nonZeroSales) : 0;
        const maxSales = Math.max(...currentSales);

        // Indices for month names (Careful with duplicate values, but standard indexOf finds first)
        const bestIndex = currentSales.indexOf(maxSales);
        const worstIndex = currentSales.indexOf(minSales); // Points to first non-zero min if used filter logic? No, indexOf searches original array.
        // Fix: We need the index of the min value we found.
        const worstMonthName = MONTHS.find((m, i) => currentSales[i] === minSales) || '-';

        const avgSpend = totalTrans > 0 ? totalSales / totalTrans : 0;

        // If Unit Selected -> avgSpend is average of monthly averages? Or Total/Total?
        // Reference "avgSpendVal = kpis...", usually TotalSales / TotalTrans is safer for accurate "Average Spend".
        // Reference HTML logic: 
        // if all: avg = TotalSales / TotalTrans
        // if unit: avg = Average of monthly averages (sum / 12). 
        // Let's stick to Total/Total as it's mathematically sounder for a "Yearly Average", 
        // but if reference explicitly did average of averages, we might see discrepancy. 
        // Reference: "avgSpendVal = currentSpendData.reduce((a,b)=>a+b,0) / currentSpendData.length;" for Single Unit.
        // Okay, I will follow reference logic for Single Unit to minimize "visual diffs".
        let finalAvgSpend = 0;
        if (unit !== 'all') {
            const sumSpends = currentSpend.reduce((a, b) => a + b, 0);
            finalAvgSpend = currentSpend.length > 0 ? sumSpends / currentSpend.length : 0;
        } else {
            finalAvgSpend = totalTrans > 0 ? totalSales / totalTrans : 0;
        }

        setKpis({
            totalSales,
            avgMonthlySales,
            bestMonth: { name: MONTHS[bestIndex], value: maxSales },
            worstMonth: { name: worstMonthName, value: minSales },
            avgSpend: finalAvgSpend,
            totalTransactions: totalTrans
        });

        // Charts
        let barDatasets = [];
        if (unit === 'all') {
            barDatasets = businessUnits.map((u, i) => ({
                label: u.name,
                data: salesData[u.name],
                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                stack: 'Stack 0',
            }));
        } else {
            const uIndex = businessUnits.findIndex(u => u.name === unit);
            barDatasets = [{
                label: unit,
                data: currentSales,
                backgroundColor: CHART_COLORS[uIndex % CHART_COLORS.length],
                stack: 'Stack 0',
            }];
        }

        const pieTotalSales = businessUnits.map(u => {
            return (salesData[u.name] || []).reduce((a, b) => a + b, 0);
        });

        // Spend Chart
        // For 'all', we derived currentSpend above. For unit, we have it.
        // Reference: "spendDataSets2024 = Object.keys(monthlySpend2024)..." - it shows ALL lines in the chart usually?
        // Reference HTML: "new Chart(..., { ... datasets: spendDataSets2024 ... })"
        // It seems the Spend Chart in Reference 2024 page ALWAYS showed all lines regardless of filter?
        // Wait, inside `update2024Focus`, it re-renders `yearlyChart2024` (Bar) but NOT `spendEvolutionChart2024`.
        // It seems `spendEvolutionChart2024` was static in the original HTML (rendering all units).
        // Let's keep it static for 'all' units to match reference, OR filter it if that makes more sense.
        // The reference `update2024Focus` did NOT update the spend chart. So it's static.
        // I will render ALL units in the spend chart.
        const spendDatasets = businessUnits.map((u, i) => ({
            label: u.name,
            data: spendData[u.name],
            borderColor: CHART_COLORS[i % CHART_COLORS.length],
            tension: 0.3,
            fill: false
        }));

        setChartData({
            barDatasets,
            pieLabels: businessUnits.map(u => u.name),
            pieData: pieTotalSales,
            spendDatasets
        });
    };

    if (loading) return <div className="text-center py-20 text-gray-500">Loading Dashboard Data...</div>;

    return (
        <div>
            <h2 className="font-serif text-3xl text-center font-semibold text-primary mb-8">2024 Yearly Overview</h2>

            {/* KPI Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <KPICard title="Total Sales 2024" value={formatCurrency(kpis.totalSales)} subtext={selectedUnit === 'all' ? 'Total Group' : selectedUnit} />
                <KPICard title="Best Month" value={kpis.bestMonth.name} subtext={formatCurrency(kpis.bestMonth.value)} color="text-accent" />
                <KPICard title="Worst Month" value={kpis.worstMonth.name} subtext={formatCurrency(kpis.worstMonth.value)} color="text-red-500" />
            </div>

            {/* KPI Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <KPICard title="Avg. Monthly Sales" value={formatCurrency(kpis.avgMonthlySales)} />
                <KPICard title="Avg. Spend" value={formatCurrency(kpis.avgSpend)} />
                <KPICard title="Total Transactions" value={formatNumber(kpis.totalTransactions)} />
            </div>

            {/* Focus Filter */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="w-full md:w-1/2">
                    <label htmlFor="businessSelector24" className="block text-lg font-medium text-gray-500 mb-2">Business Unit Focus</label>
                    <div className="relative">
                        <select
                            id="businessSelector24"
                            className="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg px-4 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer w-full"
                            value={selectedUnit}
                            onChange={(e) => setSelectedUnit(e.target.value)}
                        >
                            <option value="all">All Business Units</option>
                            {businessUnits.map(u => (
                                <option key={u.name} value={u.name}>{u.name}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                        </div>
                    </div>
                </div>
                <div className="bg-gray-50 p-6 rounded-lg w-full md:w-1/2 text-center md:text-left h-[100px] flex flex-col justify-center">
                    <h3 className="text-lg font-medium text-gray-500">Focus: {selectedUnit === 'all' ? 'Total Group' : selectedUnit}</h3>
                    <p className="text-3xl font-bold text-primary mt-1">{formatCurrency(kpis.totalSales)}</p>
                </div>
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <h2 className="font-serif text-2xl font-semibold text-primary mb-4">Monthly Sales Evolution (2024)</h2>
                    <YearlyBarChart labels={MONTHS} datasets={chartData.barDatasets} />
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <h2 className="font-serif text-2xl font-semibold text-primary mb-4">Annual Contribution (2024)</h2>
                    <YearlyPieChart labels={chartData.pieLabels} dataValues={chartData.pieData} />
                </div>
            </div>

            {/* Spend Chart */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8">
                <h2 className="font-serif text-2xl font-semibold text-primary mb-4">Average Spend per Customer Evolution 2024 (€)</h2>
                <SpendEvolutionChart labels={MONTHS} datasets={chartData.spendDatasets} />
            </div>
        </div>
    );
};

export default Dashboard2024;
