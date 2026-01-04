import React, { useEffect, useState } from 'react';
import { DataService, MONTHS, CHART_COLORS } from '../services/dataService';
import KPICard from './KPICard';
import YearlyBarChart from './YearlyBarChart';
import YearlyPieChart from './YearlyPieChart';
import SpendEvolutionChart from './SpendEvolutionChart';
import { Line } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../utils/formatters';

const Dashboard2026 = () => {
    const [loading, setLoading] = useState(true);
    const [salesData, setSalesData] = useState(null);
    const [salesData25, setSalesData25] = useState(null); // Comparison 2025
    const [transData, setTransData] = useState(null);
    const [budgetData, setBudgetData] = useState(null);
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
        spendDatasets: [],
        comparisonDatasets: []
    });

    useEffect(() => {
        const fetchData = async () => {
            const units = await DataService.getBusinessUnits();
            const sales = await DataService.get2026SalesData();
            const sales25 = await DataService.get2025SalesData(); // Fetch 2025 for comparison
            const trans = await DataService.get2026TransData();
            const budget = await DataService.get2026BudgetData();
            const spend = await DataService.get2026SpendData();

            setBusinessUnits(units);
            setSalesData(sales);
            setSalesData25(sales25);
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
    }, [selectedUnit, salesData, salesData25, businessUnits, budgetData]);

    const updateView = (unit) => {
        let currentSales = [];
        let currentSales25 = [];
        let currentBudget = [];
        let currentTrans = [];
        let currentSpend = [];

        if (unit === 'all') {
            currentSales = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + (salesData[b.name][i] || 0), 0));
            // Aggregate 2025 for comparison
            if (salesData25) {
                currentSales25 = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + (salesData25[b.name][i] || 0), 0));
            }
            currentBudget = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + (budgetData[b.name][i] || 0), 0));
            currentTrans = MONTHS.map((_, i) => businessUnits.reduce((sum, b) => sum + (transData[b.name][i] || 0), 0));
            // Derived Spend for group
            currentSpend = MONTHS.map((_, i) => {
                const tSales = currentSales[i];
                const tTrans = currentTrans[i];
                return tTrans > 0 ? Math.round(tSales / tTrans) : 0;
            });
        } else {
            currentSales = salesData[unit] || [];
            currentSales25 = salesData25 ? (salesData25[unit] || []) : [];
            currentBudget = budgetData[unit] || [];
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
            return (salesData[u.name] || []).reduce((a, b) => a + b, 0);
        });

        // Spend Chart Logic
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
                label: '2026',
                data: currentSales,
                borderColor: '#10B981', // Emerald-500
                backgroundColor: '#10B981',
                tension: 0.3,
                fill: false,
                borderWidth: 2
            },
            {
                label: '2025',
                data: currentSales25,
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
            <h2 className="font-serif text-3xl text-center font-semibold text-primary mb-8">2026 Yearly Overview</h2>

            {/* KPI Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <KPICard title="Total Sales 2026" value={formatCurrency(kpis.totalSales)} subtext={selectedUnit === 'all' ? 'Total Group' : selectedUnit} />
                <KPICard title="Best Month" value={kpis.bestMonth.name} subtext={formatCurrency(kpis.bestMonth.value)} color="text-accent" />
                <KPICard title="Worst Month" value={kpis.worstMonth.name} subtext={formatCurrency(kpis.worstMonth.value)} color="text-red-500" />
            </div>

            {/* KPI Row 2 */}
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
                </div>
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <h2 className="font-serif text-2xl font-semibold text-primary mb-4">Monthly Sales Evolution (2026)</h2>
                    <YearlyBarChart labels={MONTHS} datasets={chartData.barDatasets} />
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <h2 className="font-serif text-2xl font-semibold text-primary mb-4">Annual Contribution (2026)</h2>
                    <YearlyPieChart labels={chartData.pieLabels} dataValues={chartData.pieData} />
                </div>
            </div>

            {/* Spend Chart */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8">
                <h2 className="font-serif text-2xl font-semibold text-primary mb-4">Average Spend per Customer Evolution 2026 (€)</h2>
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
                <h2 className="font-serif text-2xl font-semibold text-primary mb-4">2025 vs 2026 Monthly Sales Comparison (€)</h2>
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

export default Dashboard2026;
