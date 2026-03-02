import React from 'react';
import { MONTHS, BUSINESS_UNITS, WEEKLY_LABELS_2025, WEEKLY_LABELS_2026 } from '../../services/dataService';
import { Tag, Maximize2 } from 'lucide-react';
import clsx from 'clsx';
import DateRangePicker from '../DateRangePicker';

/**
 * DetailsFilters — all control widgets for DashboardDetails
 * (Business Unit chips, Year, Metric, ViewType, Period range, checkboxes)
 */
const DetailsFilters = ({
    selectedYear, setSelectedYear,
    selectedUnits, toggleUnit,
    metric, setMetric,
    viewType, setViewType,
    chartType, setChartType,
    startPeriod, setStartPeriod,
    endPeriod, setEndPeriod,
    dailyStart, dailyEnd, onDailyRangeChange,
    compare24, setCompare24,
    compareBudget, setCompareBudget,
    excludeVat, setExcludeVat,
    showLabels, setShowLabels,
    setIsFullScreen,
    handlePredefinedPeriod,
}) => {
    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-8">
            {/* Business Unit Chips */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                    <Tag className="w-4 h-4 text-primary" />
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Business Units</label>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div
                        onClick={() => toggleUnit('All Groups')}
                        className={clsx('bu-chip bg-gray-200 border-gray-300 text-gray-800 font-semibold', selectedUnits.includes('All Groups') && 'active bg-primary text-white border-primary')}
                    >
                        All Groups
                    </div>
                    {BUSINESS_UNITS.map(u => (
                        <div key={u} onClick={() => toggleUnit(u)} className={clsx('bu-chip', selectedUnits.includes(u) && 'active')}>
                            {u}
                        </div>
                    ))}
                </div>
            </div>

            <hr className="border-gray-100 mb-6" />

            {/* Main Controls */}
            <div className="flex flex-col lg:flex-row gap-4 mb-6 flex-wrap">
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-2 focus:ring-accent" disabled={viewType === 'daily'}>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                </select>

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

                {/* Period Range selectors */}
                {viewType !== 'yearly' && viewType !== 'daily' && (
                    <div className="flex items-center gap-2">
                        <select value={startPeriod} onChange={e => setStartPeriod(Number(e.target.value))} className="bg-white border border-gray-300 rounded px-2 py-2 text-sm max-w-[120px]">
                            {viewType === 'monthly'
                                ? MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)
                                : (selectedYear === '2026' ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025).map((w, i) => <option key={i} value={i}>{w}</option>)
                            }
                        </select>
                        <span>-</span>
                        <select value={endPeriod} onChange={e => setEndPeriod(Number(e.target.value))} className="bg-white border border-gray-300 rounded px-2 py-2 text-sm max-w-[120px]">
                            {viewType === 'monthly'
                                ? MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)
                                : (selectedYear === '2026' ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025).map((w, i) => <option key={i} value={i}>{w}</option>)
                            }
                        </select>
                    </div>
                )}

                {/* Date Range Picker for Daily View */}
                {viewType === 'daily' && (
                    <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                        <DateRangePicker
                            startDate={dailyStart}
                            endDate={dailyEnd}
                            onChange={(start, end) => onDailyRangeChange(start, end)}
                        />
                    </div>
                )}

                {/* Right-side toggles */}
                <div className="flex items-center gap-4 ml-auto">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={compare24} onChange={e => setCompare24(e.target.checked)} className="rounded text-accent" disabled={viewType === 'daily'} />
                        <span className={clsx('text-sm font-medium', viewType === 'daily' ? 'text-gray-400' : 'text-gray-700')}>
                            vs '{selectedYear === '2026' ? '25' : '24'}
                        </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={excludeVat} onChange={e => setExcludeVat(e.target.checked)} className="rounded text-accent" />
                        <span className="text-sm font-medium text-gray-700">Net Sales</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={compareBudget} onChange={e => setCompareBudget(e.target.checked)} className="rounded text-accent" disabled={viewType === 'yearly' || metric !== 'sales' || viewType === 'daily'} />
                        <span className={clsx('text-sm font-medium', (viewType === 'yearly' || metric !== 'sales' || viewType === 'daily') ? 'text-gray-400' : 'text-gray-700')}>vs Bud.</span>
                    </label>
                    <button
                        onClick={() => setShowLabels(prev => !prev)}
                        className={clsx('p-2 rounded-lg transition-colors', showLabels ? 'bg-primary text-white' : 'text-gray-400 hover:text-primary hover:bg-gray-50')}
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
        </div>
    );
};

export default DetailsFilters;
