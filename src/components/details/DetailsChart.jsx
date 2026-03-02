import React, { useRef, useEffect, useCallback } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { X } from 'lucide-react';

/**
 * DetailsChart
 * Labels: pill above bar/point (primary datasets only), rich tooltip.
 * Fullscreen: native browser fullscreen, chart-only view.
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
    const fsRef = useRef(null);
    const prevFS  = useRef(false); // track previous value to avoid triggering on mount

    // ── Sync React state ↔ native fullscreen events (ESC key etc.) ──────────────
    useEffect(() => {
        const sync = () => {
            const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
            setIsFullScreen(active);
        };
        document.addEventListener('fullscreenchange', sync);
        document.addEventListener('webkitfullscreenchange', sync);
        return () => {
            document.removeEventListener('fullscreenchange', sync);
            document.removeEventListener('webkitfullscreenchange', sync);
        };
    }, [setIsFullScreen]);

    // ── Trigger native FS only when value CHANGES (not on initial mount) ───────
    useEffect(() => {
        if (prevFS.current === isFullScreen) return; // skip first render
        prevFS.current = isFullScreen;

        const el = fsRef.current;
        if (!el) return;

        if (isFullScreen) {
            const req = el.requestFullscreen || el.webkitRequestFullscreen;
            if (req) req.call(el).catch(() => setIsFullScreen(false));
        } else {
            const hasFS = document.fullscreenElement || document.webkitFullscreenElement;
            if (hasFS) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) exit.call(document).catch(() => {});
            }
        }
    }, [isFullScreen]);

    // ── Helpers ─────────────────────────────────────────────────────────
    const fmt = (val) => metric === 'transactions' ? formatNumber(val) : formatCurrency(val);

    // A dataset is "primary" if it is the current year (not a dashed comparison or budget)
    const isPrimary = (ds) => !ds.borderDash?.length && !ds.label?.includes('Budget');

    // ── Data labels: pill above bar/point, current-year datasets only ───────
    const datalabels = {
        display: (ctx) => showLabels && isPrimary(ctx.dataset) && ctx.parsed?.y > 0,
        anchor: 'end',
        align: 'end',
        offset: 4,
        backgroundColor: 'rgba(255,255,255,0.93)',
        borderColor: 'rgba(0,0,0,0.09)',
        borderWidth: 1,
        borderRadius: 6,
        padding: { top: 3, bottom: 3, left: 6, right: 6 },
        color: '#1f2937',
        font: { size: 11, weight: '600', family: 'Inter, sans-serif' },
        formatter: (value) => (value ? fmt(value) : null),
    };

    // ── Rich tooltip (shows % vs prev year and vs budget)─────────────────
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
        bodyFont:  { size: 12, family: 'Inter, sans-serif' },
        callbacks: {
            label: (ctx) => {
                const ds  = ctx.dataset;
                const val = ctx.parsed?.y;
                if (val == null) return ` ${ds.label}: —`;
                const fmtVal = fmt(val);
                if (!isPrimary(ds)) return ` ${ds.label}: ${fmtVal}`;

                const datasets  = ctx.chart.data.datasets;
                const idx       = ctx.dataIndex;
                const prevShort = selectedYear === '2026' ? "'25" : "'24";

                // Match prev-year dashed dataset by stripping the year short-code from the label
                const unitBase = ds.label.replace(/\s'\d{2}$/, '');
                const dsPrev   = datasets.find(d => d.borderDash?.length > 0 && d.label?.startsWith(unitBase));
                const dsBud    = datasets.find(d => d.label?.includes('Budget') && d.label?.startsWith(unitBase));

                const lines = [` ${ds.label}: ${fmtVal}`];
                if (dsPrev?.data[idx]) {
                    const pct = Math.round(((val - dsPrev.data[idx]) / dsPrev.data[idx]) * 100);
                    lines.push(`   ${pct >= 0 ? '\u2191' : '\u2193'} ${pct >= 0 ? '+' : ''}${pct}% vs ${prevShort}`);
                }
                if (dsBud?.data[idx]) {
                    const pct = Math.round(((val - dsBud.data[idx]) / dsBud.data[idx]) * 100);
                    lines.push(`   ${pct >= 0 ? '\u2191' : '\u2193'} ${pct >= 0 ? '+' : ''}${pct}% vs Budget`);
                }
                return lines;
            },
        },
    };

    // ── Chart options ─────────────────────────────────────────────────────
    const options = {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 36 } }, // room for pill labels above tallest bar
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

    // ── Empty state ───────────────────────────────────────────────────────
    if (!chartData || !chartData.datasets?.length) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400 italic text-sm">
                Select at least one business unit to display data.
            </div>
        );
    }

    const ChartComponent = chartType === 'line' ? Line : Bar;

    return (
        <div ref={fsRef} className="relative w-full h-[420px] bg-white">
            {/* Fullscreen overlay — only shown when native FS is active */}
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
                        <ChartComponent data={chartData} options={options} />
                    </div>
                </div>
            )}

            {/* Normal view */}
            {!isFullScreen && <ChartComponent data={chartData} options={options} />}
        </div>
    );
};

export default DetailsChart;
