import React, { useRef, useEffect, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { X } from 'lucide-react';
import clsx from 'clsx';

/**
 * DetailsChart
 *
 * Label strategy (readability first):
 *  • Only CURRENT-YEAR datasets get a label (comparison & budget lines get none)
 *  • Labels float ABOVE the bar / point with a white pill background — always readable
 *  • Tooltip (hover) shows EVERYTHING: current value, prev-year, % change, vs budget
 *  • Line chart: same pill above the point
 *
 * Fullscreen: native browser fullscreen API — only the chart fills the screen.
 */
const DetailsChart = ({
    chartData,
    chartType,
    metric,
    showLabels,
    selectedYear,
    isFullScreen,
    setIsFullScreen,
}) => {
    const fullscreenRef = useRef(null);

    // ── Native Fullscreen ─────────────────────────────────────────────────────
    const enterFS = useCallback(() => {
        const el = fullscreenRef.current;
        if (!el) return;
        (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
    }, []);
    const exitFS = useCallback(() => {
        if (document.fullscreenElement || document.webkitFullscreenElement)
            (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
    }, []);

    useEffect(() => {
        const sync = () => setIsFullScreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
        document.addEventListener('fullscreenchange', sync);
        document.addEventListener('webkitfullscreenchange', sync);
        return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); };
    }, [setIsFullScreen]);

    useEffect(() => { isFullScreen ? enterFS() : exitFS(); }, [isFullScreen]);

    // ── Helpers ─────────────────────────────────────────────────────────────
    const fmt = (val) => metric === 'transactions' ? formatNumber(val) : formatCurrency(val);

    // Determine if a dataset is a "primary" (current year) dataset that deserves a label
    const isPrimary = (ds) => {
        // Comparison datasets have a borderDash, budget datasets have 'Budget' in label
        if (ds.borderDash?.length > 0) return false;
        if (ds.label?.includes('Budget')) return false;
        return true;
    };

    // ── Datalabels config ───────────────────────────────────────────────────
    const datalabels = {
        // Only show for primary (current-year) datasets
        display: (ctx) => showLabels && isPrimary(ctx.dataset) && ctx.parsed.y > 0,
        anchor: 'end',
        align: 'end',   // just above the bar/point top, never clipped inside
        offset: 4,
        // White pill background for max readability on any bar color
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        borderColor: 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        borderRadius: 6,
        padding: { top: 3, bottom: 3, left: 6, right: 6 },
        color: '#1f2937',      // dark gray — always readable
        font: { size: 11, weight: '600', family: 'Inter, sans-serif' },
        clip: false,           // allow label to render outside chart area if needed
        formatter: (value) => value ? fmt(value) : null,
    };

    // ── Rich tooltip ───────────────────────────────────────────────────────
    const tooltip = {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255,255,255,0.97)',
        titleColor: '#111827',
        bodyColor: '#374151',
        borderColor: 'rgba(0,0,0,0.10)',
        borderWidth: 1,
        padding: 12,
        titleFont: { size: 12, weight: '700', family: 'Lora, serif' },
        bodyFont: { size: 12, family: 'Inter, sans-serif' },
        callbacks: {
            label: (ctx) => {
                const ds = ctx.dataset;
                const val = ctx.parsed.y;
                const formatted = fmt(val);

                // For comparison datasets, just show value (no % calc here)
                if (!isPrimary(ds)) return ` ${ds.label}: ${formatted}`;

                // For primary datasets, also compute % vs prev year and vs budget
                const datasets = ctx.chart.data.datasets;
                const idx = ctx.dataIndex;
                const prevShort = selectedYear === '2026' ? "'25" : "'24";

                const lines = [` ${ds.label}: ${formatted}`];

                // vs prev year (find matching dashed dataset for same unit)
                const unitBase = ds.label.replace(/\s'\d{2}$/, '').replace(/\s'\.?$/, '');
                const dsPrev = datasets.find(d =>
                    d.borderDash?.length > 0 &&
                    !d.label?.includes('Budget') &&
                    d.label?.startsWith(unitBase)
                );
                if (dsPrev?.data[idx]) {
                    const pct = Math.round(((val - dsPrev.data[idx]) / dsPrev.data[idx]) * 100);
                    const arrow = pct >= 0 ? '↑' : '↓';
                    const sign  = pct >= 0 ? '+' : '';
                    lines.push(`   ${arrow} ${sign}${pct}% vs ${prevShort}`);
                }

                // vs budget
                const dsBud = datasets.find(d => d.label?.includes('Budget') && d.label?.startsWith(unitBase));
                if (dsBud?.data[idx]) {
                    const pct = Math.round(((val - dsBud.data[idx]) / dsBud.data[idx]) * 100);
                    const arrow = pct >= 0 ? '↑' : '↓';
                    lines.push(`   ${arrow} ${pct >= 0 ? '+' : ''}${pct}% vs Budget`);
                }

                return lines;
            },
        },
    };

    // ── Chart options ───────────────────────────────────────────────────────────
    const baseOptions = {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
            tooltip,
            datalabels,
        },
        scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 40, font: { size: 11 } } },
            y: {
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { callback: (v) => fmt(v), font: { size: 11 } },
            },
        },
    };

    // Bar: extra top padding so pill labels have room above the tallest bar
    const barOptions  = { ...baseOptions, layout: { padding: { top: 36 } } };
    // Line: similar
    const lineOptions = { ...baseOptions, layout: { padding: { top: 36 } } };

    if (!chartData || !chartData.datasets?.length) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400 italic text-sm">
                Select at least one business unit to display data.
            </div>
        );
    }

    return (
        <div
            ref={fullscreenRef}
            className="relative w-full h-[420px]"
        >
            {/* Fullscreen overlay (shown only in native FS) */}
            {isFullScreen && (
                <div className="absolute inset-0 bg-white flex flex-col" style={{ zIndex: 10 }}>
                    <div className="flex justify-end p-4 flex-shrink-0">
                        <button
                            onClick={() => setIsFullScreen(false)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                        >
                            <X className="w-4 h-4" /> Exit Fullscreen
                        </button>
                    </div>
                    <div className="flex-1 px-6 pb-6 min-h-0">
                        {chartType === 'line'
                            ? <Line data={chartData} options={lineOptions} />
                            : <Bar  data={chartData} options={barOptions}  />
                        }
                    </div>
                </div>
            )}

            {/* Normal view */}
            {!isFullScreen && (
                chartType === 'line'
                    ? <Line data={chartData} options={lineOptions} />
                    : <Bar  data={chartData} options={barOptions}  />
            )}
        </div>
    );
};

export default DetailsChart;
