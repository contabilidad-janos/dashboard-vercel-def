import React, { useEffect, useState, useMemo } from 'react';
import { DataService } from '../services/dataService';
import { Title as ChartTitle, Chart } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { Tag, Filter, Download } from 'lucide-react';
import clsx from 'clsx';
import DateRangePicker from './DateRangePicker';
import { startOfMonth, endOfMonth, format } from 'date-fns';

Chart.register(ChartDataLabels);

const CanEscarrerDashboard = () => {
    const [loading, setLoading] = useState(true);
    const [rawData, setRawData] = useState([]);

    // Filter States
    const [filters, setFilters] = useState({
        bu: 'All',
        departamento: 'All',
        seccion: 'All',
        marca: 'All'
    });

    const [metric, setMetric] = useState('sales'); // sales (Importe), units (Uds.)

    // Date Range State (Default: Current Month)
    const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const data = await DataService.getCanEscarrerData();
            setRawData(data);
            setLoading(false);
        };
        load();
    }, []);

    // Extract unique filter options
    const options = useMemo(() => {
        const ops = {
            bu: new Set(),
            departamento: new Set(),
            seccion: new Set(),
            marca: new Set()
        };
        rawData.forEach(r => {
            if (r.bu) ops.bu.add(r.bu);
            if (r.Departamento) ops.departamento.add(r.Departamento);
            if (r.Sección) ops.seccion.add(r.Sección);
            if (r.Marca) ops.marca.add(r.Marca);
        });
        return {
            bu: Array.from(ops.bu).sort(),
            departamento: Array.from(ops.departamento).sort(),
            seccion: Array.from(ops.seccion).sort(),
            marca: Array.from(ops.marca).sort()
        };
    }, [rawData]);

    // Filter Data
    const filteredData = useMemo(() => {
        return rawData.filter(r => {
            if (filters.bu !== 'All' && r.bu !== filters.bu) return false;
            if (filters.departamento !== 'All' && r.Departamento !== filters.departamento) return false;
            if (filters.seccion !== 'All' && r.Sección !== filters.seccion) return false;
            if (filters.marca !== 'All' && r.Marca !== filters.marca) return false;

            // Date Filter (Fix for DD/MM/YYYY inputs)
            if (r.Fecha) {
                // Check if it's already YYYY-MM-DD (unlikely but safe)
                if (r.Fecha.includes('-')) {
                    if (r.Fecha < startDate || r.Fecha > endDate) return false;
                } else {
                    // Parse DD/MM/YYYY
                    const parts = r.Fecha.split('/');
                    if (parts.length === 3) {
                        const [day, month, year] = parts;
                        // Construct YYYY-MM-DD for lexical comparison
                        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        if (isoDate < startDate || isoDate > endDate) return false;
                    }
                }
            }

            return true;
        });
    }, [rawData, filters]);

    // Aggregate for "Best Selling Products"
    const topProducts = useMemo(() => {
        const productMap = {};

        filteredData.forEach(r => {
            const desc = r.Descripción || 'Unknown';
            if (!productMap[desc]) productMap[desc] = { name: desc, sales: 0, units: 0, brand: r.Marca };

            productMap[desc].sales += Number(r.Importe) || 0;
            productMap[desc].units += Number(r['Uds.']) || 0;
        });

        const sorted = Object.values(productMap).sort((a, b) => {
            if (metric === 'sales') return b.sales - a.sales;
            return b.units - a.units;
        });

        return sorted.slice(0, 50); // Top 50 for list, Top 10 for chart
    }, [filteredData, metric]);

    // Chart Data
    const chartData = useMemo(() => {
        const top10 = topProducts.slice(0, 10);
        return {
            labels: top10.map(p => p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name),
            datasets: [{
                label: metric === 'sales' ? 'Revenue (€)' : 'Units',
                data: top10.map(p => metric === 'sales' ? p.sales : p.units),
                backgroundColor: '#6E8C71',
                borderRadius: 4
            }]
        };
    }, [topProducts, metric]);

    const handleFilterChange = (key, val) => {
        setFilters(prev => ({ ...prev, [key]: val }));
    };

    if (loading) return <div className="text-center py-20 text-gray-500">Loading Can Escarrer Data...</div>;

    return (
        <div className="animate-in fade-in duration-500">
            <h2 className="font-serif text-3xl font-semibold text-primary mb-6">Can Escarrer Analysis</h2>

            {/* Filter Bar */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <Filter className="w-4 h-4 text-primary" />
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filters</label>
                </div>

                {/* Date Picker */}
                <div className="mb-6">
                    <label className="block text-xs text-gray-400 mb-1">Date Range</label>
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onChange={(start, end) => {
                            setStartDate(start);
                            if (end) setEndDate(end);
                        }}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* BU Filter */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Business Unit</label>
                        <select
                            className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary"
                            value={filters.bu}
                            onChange={e => handleFilterChange('bu', e.target.value)}
                        >
                            <option value="All">All Business Units</option>
                            {options.bu.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>

                    {/* Department Filter */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Department</label>
                        <select
                            className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary"
                            value={filters.departamento}
                            onChange={e => handleFilterChange('departamento', e.target.value)}
                        >
                            <option value="All">All Departments</option>
                            {options.departamento.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>

                    {/* Section Filter */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Section</label>
                        <select
                            className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary"
                            value={filters.seccion}
                            onChange={e => handleFilterChange('seccion', e.target.value)}
                        >
                            <option value="All">All Sections</option>
                            {options.seccion.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>

                    {/* Brand Filter */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Brand</label>
                        <select
                            className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-sm focus:ring-primary focus:border-primary"
                            value={filters.marca}
                            onChange={e => handleFilterChange('marca', e.target.value)}
                        >
                            <option value="All">All Brands</option>
                            {options.marca.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                </div>

                {/* Reset Filters */}
                <div className="mt-4 flex justify-between items-center">
                    <button
                        onClick={() => setFilters({ bu: 'All', departamento: 'All', seccion: 'All', marca: 'All' })}
                        className="text-sm text-gray-500 hover:text-primary underline"
                    >
                        Reset Filters
                    </button>
                    <div className="text-xs text-gray-400 font-mono">
                        Showing {filteredData.length} Records
                    </div>
                </div>
            </div>

            {/* Metric Toggle */}
            <div className="flex justify-start mb-6">
                <div className="bg-gray-100 p-1 rounded-lg flex">
                    <button
                        onClick={() => setMetric('sales')}
                        className={clsx("px-4 py-2 rounded-md text-sm font-medium transition-all", metric === 'sales' ? "bg-white shadow text-primary" : "text-gray-500 hover:text-gray-700")}
                    >
                        By Revenue (€)
                    </button>
                    <button
                        onClick={() => setMetric('units')}
                        className={clsx("px-4 py-2 rounded-md text-sm font-medium transition-all", metric === 'units' ? "bg-white shadow text-primary" : "text-gray-500 hover:text-gray-700")}
                    >
                        By Volume (Units)
                    </button>
                </div>
            </div>

            {/* Top 10 Chart */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8 h-[400px]">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 10 Best Selling Products</h3>
                <Bar
                    data={chartData}
                    options={{
                        maintainAspectRatio: false,
                        indexAxis: 'y', // Horizontal Bar
                        plugins: {
                            legend: { display: false },
                            datalabels: {
                                anchor: 'end',
                                align: 'end',
                                formatter: (val) => metric === 'sales' ? formatCurrency(val) : formatNumber(val),
                                color: '#374151',
                                font: { weight: 'bold' }
                            }
                        },
                        scales: {
                            x: {
                                ticks: { callback: (val) => metric === 'sales' ? formatCurrency(val) : formatNumber(val) }
                            }
                        }
                    }}
                />
            </div>

            {/* Detailed Table */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Product Breakdown (Top 50)</h3>
                    <button onClick={() => {
                        // Simple CSV Download Logic
                        const headers = ["Product", "Brand", "Revenue", "Units"];
                        const rows = topProducts.map(p => [
                            `"${p.name.replace(/"/g, '""')}"`,
                            `"${p.brand}"`,
                            p.sales,
                            p.units
                        ]);
                        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `best_selling_${new Date().toISOString().slice(0, 10)}.csv`;
                        a.click();
                    }} className="flex items-center gap-2 text-sm text-primary hover:underline">
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                            <tr>
                                <th className="py-3 px-4">Rank</th>
                                <th className="py-3 px-4">Product</th>
                                <th className="py-3 px-4">Brand</th>
                                <th className="py-3 px-4 text-right">Revenue (€)</th>
                                <th className="py-3 px-4 text-right">Units</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {topProducts.map((p, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="py-3 px-4 text-gray-500">#{i + 1}</td>
                                    <td className="py-3 px-4 font-medium text-gray-800">{p.name}</td>
                                    <td className="py-3 px-4 text-gray-600">{p.brand}</td>
                                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(p.sales)}</td>
                                    <td className="py-3 px-4 text-right font-mono">{formatNumber(p.units)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CanEscarrerDashboard;
