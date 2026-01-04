import React, { useEffect, useState } from 'react';
import { DataService, MONTHS, CHART_COLORS } from '../services/dataService';
import { VAT_RATES } from '../data/SEED_DATA';
import KPICard from './KPICard';
import YearlyBarChart from './YearlyBarChart';
import YearlyPieChart from './YearlyPieChart';
import SpendEvolutionChart from './SpendEvolutionChart';
import { Line } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../utils/formatters';

const Dashboard2025 = () => {
    const [loading, setLoading] = useState(true);
    const [salesData, setSalesData] = useState(null);
    const [salesData24, setSalesData24] = useState(null); // Added 2024 data
    const [transData, setTransData] = useState(null);
    const [budgetData, setBudgetData] = useState(null);
    const [spendData, setSpendData] = useState(null);
    const [businessUnits, setBusinessUnits] = useState([]);
    const [selectedUnit, setSelectedUnit] = useState('all');
    const [excludeVat, setExcludeVat] = useState(false);

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
        spendDatasets: [],
        comparisonDatasets: [] // Added for comparison
    });

    useEffect(() => {
        const fetchData = async () => {
            const units = await DataService.getBusinessUnits();
            const sales = await DataService.get2025SalesData();
            const sales24 = await DataService.get2024SalesData(); // Fetch 2024
            const trans = await DataService.get2025TransData();
            const budget = await DataService.get2025BudgetData();
            const spend = await DataService.get2025SpendData();

            setBusinessUnits(units);
            setSalesData(sales);
            setSalesData24(sales24); // Set 2024
            setTransData(trans);
            setBudgetData(budget);
            setSpendData(spend);
            setLoading(false);
        };

        fetchData();
    }, []);

    useEffect(() => {
        if (!salesData || !businessUnits.length) return;
        updateView(selectedUnit);
    }, [selectedUnit, salesData, salesData24, businessUnits, budgetData, excludeVat]);

    const getNetValue = (val, unitName) => {
        if (!excludeVat) return val;
        const rate = VAT_RATES[unitName] || 0;
        return val / (1 + rate);
    };

    const updateView = (unit) => {
        let currentSales = [];
        let currentSales24 = [];
        let currentBudget = [];
        let currentTrans = [];
        let currentSpend = [];

        if (unit === 'all') {
            currentSales = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + getNetValue((salesData[b.name][i] || 0), b.name), 0));
            // Aggregate 2024
            if (salesData24) {
                currentSales24 = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + getNetValue((salesData24[b.name][i] || 0), b.name), 0));
            }
            currentBudget = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + getNetValue((budgetData[b.name][i] || 0), b.name), 0));
            currentTrans = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + (transData[b.name][i] || 0), 0));
            // Derived Spend for group
            currentSpend = MONTHS.map((_, i) => {
                const tSales = currentSales[i];
                const tTrans = currentTrans[i];
                return tTrans > 0 ? Math.round(tSales / tTrans) : 0;
            });
        } else {
            currentSales = (salesData[unit] || []).map(v => getNetValue(v, unit));
            currentSales24 = salesData24 ? (salesData24[unit] || []).map(v => getNetValue(v, unit)) : [];
            currentBudget = (budgetData[unit] || []).map(v => getNetValue(v, unit));
            currentTrans = transData[unit] || [];
            currentSpend = spendData[unit] || [];
        }

        // KPI Calculation
        const totalSales = currentSales.reduce((a, b) => a + b, 0);
        const avgMonthlySales = totalSales / MONTHS.length; // Or active months? Assume 12 for forecast.
        const nonZeroSales = currentSales.filter(v => v > 0);
        const minSales = nonZeroSales.length > 0 ? Math.min(...nonZeroSales) : 0;
        const maxSales = Math.max(...currentSales);
        const bestIndex = currentSales.indexOf(maxSales);
        const worstMonthName = MONTHS.find((m, i) => currentSales[i] === minSales) || '-';

        const totalTrans = currentTrans.reduce((a, b) => a + b, 0);

        // Avg Spend Calculation
        let avgSpend = 0;
        if (unit === 'all') {
            avgSpend = totalTrans > 0 ? totalSales / totalTrans : 0;
        } else {
            // Average of monthly averages for unit? Or Total/Total?
            // Reference logic usually prefers Total/Total for accuracy unless specified.
            avgSpend = totalTrans > 0 ? totalSales / totalTrans : 0;
        }

        setKpis({
            totalSales,
            avgMonthlySales,
            bestMonth: { name: MONTHS[bestIndex], value: maxSales },
            worstMonth: { name: worstMonthName, value: minSales },
            avgSpend,
            totalTransactions: totalTrans
        });

        // Chart Data Preparation
        let barDatasets = [];
        if (unit === 'all') {
            barDatasets = businessUnits.map((u, i) => ({
                label: u.name,
                data: (salesData[u.name] || []).map(v => getNetValue(v, u.name)),
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

        // Add Budget Line
        barDatasets.push({
            type: 'line',
            label: 'Budget',
            data: currentBudget,
            borderColor: '#4A5568',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            order: -1
        });

        // Pie Chart
        const pieTotalSales = businessUnits.map(u => {
            return (salesData[u.name] || []).reduce((a, b) => a + getNetValue(b, u.name), 0);
        });

        // Spend Chart Logic
        // If 'all' selected, do we show ALL lines or just the aggregate line?
        // Reference HTML 2025: spendEvolutionChart2025 dataset construction:
        // "datasets: spendDataSets2025". It seems it shows ALL lines always.
        const spendDatasets = businessUnits.map((u, i) => ({
            label: u.name,
            data: spendData[u.name],
            borderColor: CHART_COLORS[i % CHART_COLORS.length],
            tension: 0.3,
            fill: false
        }));

        // Comparison Chart Datasets
        const comparisonDatasets = [
            {
                label: '2025',
                data: currentSales,
                borderColor: '#10B981', // Emerald-500
                backgroundColor: '#10B981',
                tension: 0.3,
                fill: false,
                borderWidth: 2
            },
            {
                label: '2024',
                data: currentSales24,
                borderColor: '#9CA3AF', // Gray-400
                backgroundColor: '#9CA3AF',
                tension: 0.3,
                fill: false,
                borderDash: [5, 5],
                borderWidth: 2
            }
        ];

        setChartData({
            barDatasets,
            pieLabels: businessUnits.map(u => u.name),
            pieData: pieTotalSales,
            spendDatasets,
            comparisonDatasets
        });
    };

    if (loading) return <div className="text-center py-20 text-gray-500">Loading Dashboard Data...</div>;

    return (
        <div>
            <h2 className="font-serif text-3xl text-center font-semibold text-primary mb-8">2025 Yearly Overview</h2>

            {/* KPI Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <KPICard title="Total Sales 2025" value={formatCurrency(kpis.totalSales)} subtext={selectedUnit === 'all' ? 'Total Group' : selectedUnit} />
                <KPICard title="Best Month" value={kpis.bestMonth.name} subtext={formatCurrency(kpis.bestMonth.value)} color="text-accent" />
                <KPICard title="Worst Month" value={kpis.worstMonth.name} subtext={formatCurrency(kpis.worstMonth.value)} color="text-red-500" />
            </div>

            {/* KPI Row 2 (Added) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <KPICard title="Avg. Monthly Sales" value={formatCurrency(kpis.avgMonthlySales)} />
                <KPICard title="Avg. Spend" value={formatCurrency(kpis.avgSpend)} subtext="per transaction" />
                <KPICard title="Total Transactions" value={formatNumber(kpis.totalTransactions)} />
            </div>

            {/* Focus Filter */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="w-full md:w-1/2">
                    <label htmlFor="businessSelector" className="block text-lg font-medium text-gray-500 mb-2">Business Unit Focus</label>
                    <div className="relative">
                        <select
                            id="businessSelector"
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
                    <div className="mt-4 flex items-center gap-2">
                        <label className="inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={excludeVat} onChange={(e) => setExcludeVat(e.target.checked)} className="sr-only peer" />
                            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                            <span className="ms-3 text-sm font-medium text-gray-900">Exclude VAT</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <h2 className="font-serif text-2xl font-semibold text-primary mb-4">Monthly Sales Evolution (2025)</h2>
                    <YearlyBarChart labels={MONTHS} datasets={chartData.barDatasets} />
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <h2 className="font-serif text-2xl font-semibold text-primary mb-4">Annual Contribution (2025)</h2>
                    <YearlyPieChart labels={chartData.pieLabels} dataValues={chartData.pieData} />
                </div>
            </div>

            {/* Spend Chart */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8">
                <h2 className="font-serif text-2xl font-semibold text-primary mb-4">Average Spend per Customer Evolution 2025 (€)</h2>
                {chartData.spendDatasets.length > 0 ? (
                    <SpendEvolutionChart labels={MONTHS} datasets={chartData.spendDatasets} />
                ) : (
                    <div className="h-[450px] flex items-center justify-center text-gray-400 border-2 border-dashed rounded-lg">
                        Data migration in progress (Spend Data)
                    </div>
                )}
            </div>

            {/* Comparison Chart */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mt-8">
                <h2 className="font-serif text-2xl font-semibold text-primary mb-4">2024 vs 2025 Monthly Sales Comparison (€)</h2>
                <div className="h-[400px]">
                    <Line
                        data={{ labels: MONTHS, datasets: chartData.comparisonDatasets }}
                        options={{
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { position: 'bottom' },
                                datalabels: {
                                    display: false
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: { callback: (v) => formatCurrency(v) }
                                }
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default Dashboard2025;
