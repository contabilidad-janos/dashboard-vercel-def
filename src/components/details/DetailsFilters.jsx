import React from 'react';
import { Settings, Calendar, Filter, TrendingUp, BarChart2, PieChart } from 'lucide-react';

const VIEW_MODES = [
    { id: 'daily', label: 'Daily', icon: <Calendar className="w-4 h-4 mr-2" /> },
    { id: 'weekly', label: 'Weekly', icon: <TrendingUp className="w-4 h-4 mr-2" /> },
    { id: 'monthly', label: 'Monthly', icon: <BarChart2 className="w-4 h-4 mr-2" /> }
];

const METRICS = [
    { id: 'sales', label: 'Revenue' },
    { id: 'transactions', label: 'Volume (Covers)' },
];

const CHART_OPTIONS = [
    { id: 'bar', label: 'Grouped Bar' },
    { id: 'stacked-bar', label: 'Stacked Bar' },
    { id: 'line', label: 'Line Chart' },
    { id: 'donut', label: 'Donut' }
];

const YEARS = ['2026', '2025', '2024'];

const DetailsFilters = ({ filters, onFilterChange, businessUnits }) => {

    const {
        viewMode, metric, chartType, selectedYear,
        includeVat, compare2024, compare2025, compareBudget,
        selectedUnits, dateRange
    } = filters;

    const toggleUnit = (unit) => {
        if (unit === 'All Units') {
            onFilterChange('selectedUnits', ['All Units']);
            return;
        }

        let newUnits = [...selectedUnits];
        if (newUnits.includes('All Units')) {
            newUnits = [unit];
        } else {
            if (newUnits.includes(unit)) {
                newUnits = newUnits.filter(u => u !== unit);
                if (newUnits.length === 0) newUnits = ['All Units'];
            } else {
                newUnits.push(unit);
            }
        }
        onFilterChange('selectedUnits', newUnits);
    };

    const handleDateRangeChange = (type, value) => {
        const d = new Date(value);
        if (isNaN(d.getTime())) return;

        onFilterChange('dateRange', {
            ...dateRange,
            [type]: d
        });
    };

    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">

            {/* TOP ROW: Primary Controls */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 pb-6 border-b border-gray-100">

                {/* View Mode & Metric Toggles */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50/50">
                        {VIEW_MODES.map((mode) => (
                            <button
                                key={mode.id}
                                onClick={() => onFilterChange('viewMode', mode.id)}
                                className={`
                  flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
                  ${viewMode === mode.id
                                        ? 'bg-white text-primary shadow-sm border border-gray-200/50'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
                `}
                            >
                                {mode.icon}
                                {mode.label}
                            </button>
                        ))}
                    </div>

                    <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50/50">
                        {METRICS.map((m) => (
                            <button
                                key={m.id}
                                onClick={() => onFilterChange('metric', m.id)}
                                className={`
                  px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
                  ${metric === m.id
                                        ? 'bg-white text-primary shadow-sm border border-gray-200/50'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}
                `}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Year Selection & VAT */}
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-500">Year:</span>
                        <div className="flex rounded-lg overflow-hidden border border-gray-200">
                            {YEARS.map(year => (
                                <button
                                    key={year}
                                    onClick={() => onFilterChange('selectedYear', year)}
                                    className={`px-4 py-2 text-sm transition-colors ${selectedYear === year
                                            ? 'bg-primary text-white font-medium'
                                            : 'bg-white text-gray-600 hover:bg-gray-50'
                                        }`}
                                >
                                    {year}
                                </button>
                            ))}
                        </div>
                    </div>

                    <label className="inline-flex items-center cursor-pointer ml-4">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={includeVat}
                            onChange={(e) => onFilterChange('includeVat', e.target.checked)}
                            disabled={metric === 'transactions'}
                        />
                        <div className={`
              relative w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer 
              peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full 
              peer-checked:after:border-white after:content-[''] after:absolute 
              after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 
              after:border after:rounded-full after:h-5 after:w-5 after:transition-all
              ${metric === 'transactions' ? 'opacity-50' : 'peer-checked:bg-teal-600'}
            `}></div>
                        <span className={`ms-3 text-sm font-medium ${metric === 'transactions' ? 'text-gray-400' : 'text-gray-700'}`}>
                            Inc. VAT
                        </span>
                    </label>
                </div>
            </div>

            {/* SECOND ROW: Specific View Controls & Unit Selection */}
            <div className="flex flex-col lg:flex-row gap-8">

                {/* Left Col: View specific controls */}
                <div className="flex-1 space-y-6">

                    {/* Chart Type Selection */}
                    <div>
                        <h4 className="flex items-center text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2">
                            <Filter className="w-4 h-4 mr-2 text-gray-400" />
                            Chart Representation
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {CHART_OPTIONS.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => onFilterChange('chartType', opt.id)}
                                    className={`px-3 py-1.5 rounded-md text-sm transition-colors border ${chartType === opt.id
                                            ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Date Formatting if Daily */}
                    {viewMode === 'daily' && (
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2">Custom Date Range</h4>
                            <div className="flex items-center gap-4">
                                <div className="max-w-[150px]">
                                    <label className="text-xs text-gray-500 mb-1 block">From</label>
                                    <input
                                        type="date"
                                        value={dateRange.from ? new Date(dateRange.from.getTime() - dateRange.from.getTimezoneOffset() * 60000).toISOString().split('T')[0] : ''}
                                        onChange={(e) => handleDateRangeChange('from', e.target.value)}
                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-accent focus:ring-accent"
                                    />
                                </div>
                                <div className="max-w-[150px]">
                                    <label className="text-xs text-gray-500 mb-1 block">To</label>
                                    <input
                                        type="date"
                                        value={dateRange.to ? new Date(dateRange.to.getTime() - dateRange.to.getTimezoneOffset() * 60000).toISOString().split('T')[0] : ''}
                                        onChange={(e) => handleDateRangeChange('to', e.target.value)}
                                        className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-accent focus:ring-accent"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Comparisons */}
                    <div>
                        <h4 className="flex items-center text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-2">
                            <Settings className="w-4 h-4 mr-2 text-gray-400" />
                            Comparisons
                        </h4>
                        <div className="flex flex-wrap gap-4">
                            {selectedYear === '2026' && (
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={compare2025}
                                        onChange={(e) => onFilterChange('compare2025', e.target.checked)}
                                        className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm text-gray-700">vs 2025</span>
                                </label>
                            )}

                            {selectedYear === '2025' && (
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={compare2024}
                                        onChange={(e) => onFilterChange('compare2024', e.target.checked)}
                                        className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm text-gray-700">vs 2024</span>
                                </label>
                            )}

                            <label className={`flex items-center space-x-2 ${metric !== 'sales' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={compareBudget}
                                    onChange={(e) => onFilterChange('compareBudget', e.target.checked)}
                                    disabled={metric !== 'sales'}
                                    className="rounded border-gray-300 text-purple-500 focus:ring-purple-500"
                                />
                                <span className={`text-sm ${metric !== 'sales' ? 'text-gray-400' : 'text-gray-700'}`}>
                                    vs Budget
                                </span>
                            </label>
                        </div>
                    </div>

                </div>

                {/* Right Col: Business Units Pivot Style */}
                <div className="lg:w-[40%] bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center justify-between">
                        Business Units Filter
                        <span className="text-xs font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                            {selectedUnits.includes('All Units') ? 'All' : selectedUnits.length}Selected
                        </span>
                    </h4>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => toggleUnit('All Units')}
                            className={`
                px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border
                ${selectedUnits.includes('All Units')
                                    ? 'bg-primary text-white border-primary shadow-sm'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-100'}
              `}
                        >
                            All Units
                        </button>

                        {businessUnits.map(unit => {
                            const isSelected = selectedUnits.includes(unit);
                            // Visual indicator color mapping rough approximation based on BU name if needed
                            // For now just generic styling
                            return (
                                <button
                                    key={unit}
                                    onClick={() => toggleUnit(unit)}
                                    disabled={selectedUnits.includes('All Units')}
                                    className={`
                    px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border flex items-center gap-1.5
                    ${selectedUnits.includes('All Units')
                                            ? 'opacity-50 bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                            : isSelected
                                                ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm'
                                                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                                        }
                  `}
                                >
                                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                                    {unit}
                                </button>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default DetailsFilters;
