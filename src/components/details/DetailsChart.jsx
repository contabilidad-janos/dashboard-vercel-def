import React, { useRef, useEffect, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { X } from 'lucide-react';
import clsx from 'clsx';

/**
 * DetailsChart — renders the chart with:
 *  - Labels INSIDE bars (centered, white text) for bar charts
 *  - Labels above points for line charts
 *  - Native browser fullscreen (chart only fills the entire device screen)
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

    // ── Native fullscreen lifecycle ──────────────────────────────────────
    const enterFullscreen = useCallback(() => {
        const el = fullscreenRef.current;
        if (!el) return;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }, []);

    const exitFullscreen = useCallback(() => {
        if (document.fullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    }, []);

    // Sync isFullScreen with actual browser fullscreen state
    useEffect(() => {
        const onFSChange = () => {
            const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
            setIsFullScreen(active);
        };
        document.addEventListener('fullscreenchange', onFSChange);
        document.addEventListener('webkitfullscreenchange', onFSChange);
        return () => {
            document.removeEventListener('fullscreenchange', onFSChange);
            document.removeEventListener('webkitfullscreenchange', onFSChange);
        };
    }, [setIsFullScreen]);

    // Trigger native fullscreen when prop changes to true
    useEffect(() => {
        if (isFullScreen) {
            enterFullscreen();
        } else {
            exitFullscreen();
        }
    }, [isFullScreen]);

    // ── Formatters ───────────────────────────────────────────────────────────
    const fmt = (val) => metric === 'transactions' ? formatNumber(val) : formatCurrency(val);
    const yTick = (val) => metric === 'transactions' ? formatNumber(val) : formatCurrency(val);

    // ── Bar chart: labels INSIDE bars (centered, white) ─────────────────────
    const barDatalabels = {
        display: showLabels,
        anchor: 'center',
        align: 'center',
        color: (ctx) => {
            // White text inside colored bars, dark text inside light bars
            const bg = Array.isArray(ctx.dataset.backgroundColor)
                ? ctx.dataset.backgroundColor[ctx.dataIndex]
                : ctx.dataset.backgroundColor;
            // Light bars (gray) → dark text, dark bars → white
            return bg === '#A9A9A9' || bg === '#E8C89A' || bg === '#C4BFAA' ? '#374151' : '#ffffff';
        },
        font: { size: 11, weight: '700' },
        formatter: (value, ctx) => {
            if (!value || value === 0) return null;
            const label = ctx.dataset.label || '';
            const isComparison = ctx.dataset.borderDash?.length > 0;
            if (isComparison) return null; // no labels on dashed (comparison) datasets

            const lines = [fmt(value)];

            // Add % vs prev year and vs budget
            const prevShort = selectedYear === '2026' ? "'25" : "'24";
            const datasets = ctx.chart.data.datasets;
            const idx = ctx.dataIndex;

            const dsPrev = datasets.find(d => d.label?.endsWith(prevShort) && d.borderDash?.length > 0);
            if (dsPrev?.data[idx]) {
                const pct = Math.round(((value - dsPrev.data[idx]) / dsPrev.data[idx]) * 100);
                lines.push(`${pct >= 0 ? '+' : ''}${pct}% vs ${prevShort}`);
            }

            const dsBud = datasets.find(d => d.label?.includes('Budget'));
            if (dsBud?.data[idx]) {
                const pct = Math.round(((value - dsBud.data[idx]) / dsBud.data[idx]) * 100);
                lines.push(`${pct >= 0 ? '+' : ''}${pct}% Bud`);
            }

            return lines;
        },
    };

    // ── Line chart: labels above data points ─────────────────────────────
    const lineDatalabels = {
        display: showLabels,
        anchor: 'end',
        align: 'top',
        color: '#374151',
        font: { size: 10, weight: '600' },
        formatter: (value) => value ? fmt(value) : null,
    };

    // ── Shared chart options ───────────────────────────────────────────────
    const baseOptions = {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                position: 'bottom',
                labels: { usePointStyle: true, padding: 16, font: { size: 12 } },
            },
            tooltip: {
                callbacks: {
                    label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
                },
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { maxRotation: 40, font: { size: 11 } },
            },
            y: {
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { callback: yTick, font: { size: 11 } },
            },
        },
    };

    const barOptions = {
        ...baseOptions,
        layout: { padding: { top: 8 } }, // slight top padding so inside labels aren't clipped at 100%
        plugins: { ...baseOptions.plugins, datalabels: barDatalabels },
    };

    const lineOptions = {
        ...baseOptions,
        layout: { padding: { top: 28 } }, // room for above-point labels
        plugins: { ...baseOptions.plugins, datalabels: lineDatalabels },
    };

    // ── Render ───────────────────────────────────────────────────────────────
    if (!chartData || !chartData.datasets?.length) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400 italic text-sm">
                Select at least one business unit to display data.
            </div>
        );
    }

    return (
        /*
         * This div becomes the fullscreen element.
         * In fullscreen it fills the entire device screen (handled by native FS API).
         * CSS :fullscreen rule below makes the chart fill that space.
         */
        <div
            ref={fullscreenRef}
            className={clsx(
                'relative w-full rounded-xl overflow-hidden',
                'transition-all duration-300',
                // Normal height
                'h-[420px]',
            )}
            style={{
                // In fullscreen the browser gives the element 100vw × 100vh automatically.
                // We only set bg so it looks clean on dark screens.
            }}
        >
            {/* Fullscreen overlay: only visible when in native FS */}
            {isFullScreen && (
                <div
                    className="absolute inset-0 bg-white flex flex-col"
                    style={{ zIndex: 10 }}
                >
                    {/* Close button */}
                    <div className="flex justify-end p-4">
                        <button
                            onClick={() => setIsFullScreen(false)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                        >
                            <X className="w-4 h-4" />
                            Exit Fullscreen
                        </button>
                    </div>

                    {/* Chart fills remaining space */}
                    <div className="flex-1 px-6 pb-6">
                        {chartType === 'line'
                            ? <Line data={chartData} options={lineOptions} />
                            : <Bar  data={chartData} options={barOptions} />
                        }
                    </div>
                </div>
            )}

            {/* Normal (non-fullscreen) chart */}
            {!isFullScreen && (
                chartType === 'line'
                    ? <Line data={chartData} options={lineOptions} />
                    : <Bar  data={chartData} options={barOptions}  />
            )}
        </div>
    );
};

export default DetailsChart;
