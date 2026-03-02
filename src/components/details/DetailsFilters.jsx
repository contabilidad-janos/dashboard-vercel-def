import React from 'react';
import { MONTHS, BUSINESS_UNITS, WEEKLY_LABELS_2025, WEEKLY_LABELS_2026 } from '../../services/dataService';
import { Tag, Maximize2, BarChart2, LineChart } from 'lucide-react';
import clsx from 'clsx';
import DateRangePicker from '../DateRangePicker';
import SegmentedControl from '../ui/SegmentedControl';

const VIEW_OPTIONS = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'weekly',  label: 'Weekly'  },
    { value: 'daily',   label: 'Daily'   },
    { value: 'yearly',  label: 'Yearly'  },
];

const METRIC_OPTIONS = [
    { value: 'sales',        label: 'Sales €'     },
    { value: 'transactions', label: 'Volume'       },
    { value: 'spend',        label: 'Avg Spend'    },
];

const CHART_OPTIONS = [
    { value: 'bar',  label: 'Bar'  },
    { value: 'line', label: 'Line' },
];

const PRESET_LABELS = [
    { value: 'q1',     label: 'Q1'     },
    { value: 'q2',     label: 'Q2'     },
    { value: 'q3',     label: 'Q3'     },
    { value: 'q4',     label: 'Q4'     },
    { value: 'summer', label: 'Summer' },
    { value: 'ytd',    label: 'YTD'    },
];

/**
 * DetailsFilters — redesigned control panel for DashboardDetails.
 * Organised into 4 clear rows:
 *   1. View · Metric · Chart segmented controls
 *   2. Business Unit chips
 *   3. Comparison toggles (vs prev year · Net Sales · vs Budget)
 *   4. Period range (monthly/weekly) OR DatePicker (daily)  [hidden for yearly]
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
    const weeklyLabels = selectedYear === '2026' ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025;
    const isDaily  = viewType === 'daily';
    const isYearly = viewType === 'yearly';
    const showPeriod = !isDaily && !isYearly;

    // Pill-checkbox component (replaces bare <input type="checkbox">)
    const PillToggle = ({ checked, onChange, label, disabled }) => (
        <button
            onClick={() => !disabled && onChange(!checked)}
            className={clsx(
                'px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200 select-none',
                disabled
                    ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                    : checked
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'border-gray-300 text-gray-500 hover:border-accent hover:text-accent bg-white'
            )}
            disabled={disabled}
        >
            {checked ? '✓ ' : ''}{label}
        </button>
    );

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">

            {/* ── Row 1: Main Controls ─────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100">
                {/* Year toggle */}
                <SegmentedControl
                    options={[{ value: '2025', label: '2025' }, { value: '2026', label: '2026' }]}
                    value={selectedYear}
                    onChange={setSelectedYear}
                    disabled={isDaily}
                />

                <div className="w-px h-7 bg-gray-200" />

                {/* View type */}
                <SegmentedControl options={VIEW_OPTIONS} value={viewType} onChange={setViewType} />

                <div className="w-px h-7 bg-gray-200" />

                {/* Metric */}
                <SegmentedControl
                    options={METRIC_OPTIONS.map(o => ({
                        ...o,
                        disabled: isDaily && o.value !== 'sales',
                    }))}
                    value={metric}
                    onChange={setMetric}
                    disabled={isDaily}
                />

                <div className="w-px h-7 bg-gray-200" />

                {/* Chart type */}
                <SegmentedControl options={CHART_OPTIONS} value={chartType} onChange={setChartType} />

                {/* Spacer + icon buttons far right */}
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={() => setShowLabels(prev => !prev)}
                        title={showLabels ? 'Hide labels' : 'Show labels'}
                        className={clsx(
                            'p-2 rounded-lg transition-colors text-sm font-semibold',
                            showLabels ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-primary'
                        )}
                    >
                        <Tag className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setIsFullScreen(true)}
                        title="Fullscreen"
                        className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-primary transition-colors"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Row 2: Business Unit Chips ───────────────────────────────────── */}
            <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Business Units</p>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => toggleUnit('All Groups')}
                        className={clsx(
                            'bu-chip font-semibold',
                            selectedUnits.includes('All Groups') && 'active'
                        )}
                    >
                        All Groups
                    </button>
                    {BUSINESS_UNITS.map(u => (
                        <button
                            key={u}
                            onClick={() => toggleUnit(u)}
                            className={clsx('bu-chip', selectedUnits.includes(u) && 'active')}
                        >
                            {u}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Row 3: Comparison Toggles ────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Compare:</span>
                <PillToggle
                    checked={compare24}
                    onChange={setCompare24}
                    label={`vs '${selectedYear === '2026' ? '25' : '24'}`}
                    disabled={isDaily}
                />
                <PillToggle
                    checked={excludeVat}
                    onChange={setExcludeVat}
                    label="Net (ex. VAT)"
                />
                <PillToggle
                    checked={compareBudget}
                    onChange={setCompareBudget}
                    label="vs Budget"
                    disabled={isYearly || metric !== 'sales' || isDaily}
                />
            </div>

            {/* ── Row 4: Period Selector ───────────────────────────────────────── */}
            {showPeriod && (
                <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Period:</span>

                    {/* Preset pills */}
                    {PRESET_LABELS.map(p => (
                        <button
                            key={p.value}
                            onClick={() => handlePredefinedPeriod({ target: { value: p.value } })}
                            className="px-3 py-1 text-xs font-medium border border-gray-300 rounded-full text-gray-600 hover:border-accent hover:text-accent hover:bg-accent/5 transition-all"
                        >
                            {p.label}
                        </button>
                    ))}

                    <div className="w-px h-5 bg-gray-200" />

                    {/* Custom From → To selects */}
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400 text-xs">From</span>
                        <select
                            value={startPeriod}
                            onChange={e => setStartPeriod(Number(e.target.value))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:ring-1 focus:ring-accent focus:outline-none"
                        >
                            {(viewType === 'monthly' ? MONTHS : weeklyLabels).map((lbl, i) => (
                                <option key={i} value={i}>{lbl}</option>
                            ))}
                        </select>
                        <span className="text-gray-400">→</span>
                        <select
                            value={endPeriod}
                            onChange={e => setEndPeriod(Number(e.target.value))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:ring-1 focus:ring-accent focus:outline-none"
                        >
                            {(viewType === 'monthly' ? MONTHS : weeklyLabels).map((lbl, i) => (
                                <option key={i} value={i}>{lbl}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* ── Daily DatePicker ─────────────────────────────────────────────── */}
            {isDaily && (
                <div className="flex items-center gap-3 px-5 py-3">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Date Range:</span>
                    <DateRangePicker
                        startDate={dailyStart}
                        endDate={dailyEnd}
                        onChange={(start, end) => onDailyRangeChange(start, end)}
                    />
                </div>
            )}
        </div>
    );
};

export default DetailsFilters;
