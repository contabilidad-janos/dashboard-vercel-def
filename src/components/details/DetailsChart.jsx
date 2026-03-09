import React, { useRef, useEffect } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { Tag, Maximize2, X } from 'lucide-react';
import clsx from 'clsx';
import YearlyPieChart from '../YearlyPieChart';

const DetailsChart = ({
    chartData,
    chartType,
    metric,
    showLabels,
    setShowLabels,
    selectedYear,
    isFullScreen,
    setIsFullScreen,
}) => {
    const fsRef = useRef(null);
    const prevFS = useRef(false);

    // ── Native fullscreen ──────────────────────────────────────────────────
    useEffect(() => {
        const sync = () => setIsFullScreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
        document.addEventListener('fullscreenchange', sync);
        document.addEventListener('webkitfullscreenchange', sync);
        return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); };
    }, [setIsFullScreen]);

    useEffect(() => {
        if (prevFS.current === isFullScreen) return;
        prevFS.current = isFullScreen;
        const el = fsRef.current;
        if (!el) return;
        if (isFullScreen) {
            const req = el.requestFullscreen || el.webkitRequestFullscreen;
            if (req) req.call(el).catch(() => setIsFullScreen(false));
        } else {
            const hasFS = document.fullscreenElement || document.webkitFullscreenElement;
            if (hasFS) { const exit = document.exitFullscreen || document.webkitExitFullscreen; if (exit) exit.call(document).catch(() => { }); }
        }
    }, [isFullScreen]);

    // ── Format helpers ───────────────────────────────────────────────
    const fmt = (v) => metric === 'transactions' ? formatNumber(v) : formatCurrency(v);

    // ── Chart options ──────────────────────────────────────────────────
    const prevShort = selectedYear === '2026' ? "'25" : "'24";

    const options = {
        maintainAspectRatio: false,
        clip: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 48 } },
        plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
            tooltip: {
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
                        const val = ctx.parsed?.y;
                        if (val == null) return ` ${ds.label}: —`;
                        const fmtVal = fmt(Math.round(val));
                        const isPrimary = !ds.borderDash?.length && !ds.label?.includes('Budget');
                        if (!isPrimary) return ` ${ds.label}: ${fmtVal}`;

                        const datasets = ctx.chart.data.datasets;
                        const idx = ctx.dataIndex;
                        const unitBase = ds.label.replace(/\s'\d{2}$/, '');
                        const dsPrev = datasets.find(d => d.borderDash?.length > 0 && d.label?.startsWith(unitBase));
                        const dsBud = datasets.find(d => d.label?.includes('Budget') && d.label?.startsWith(unitBase));

                        const lines = [` ${ds.label}: ${fmtVal}`];
                        if (dsPrev?.data[idx]) {
                            const pct = Math.round(((val - dsPrev.data[idx]) / dsPrev.data[idx]) * 100);
                            lines.push(`   ${pct >= 0 ? '↑' : '↓'} ${pct >= 0 ? '+' : ''}${pct}% vs ${prevShort}`);
                        }
                        if (dsBud?.data[idx]) {
                            const pct = Math.round(((val - dsBud.data[idx]) / dsBud.data[idx]) * 100);
                            lines.push(`   ${pct >= 0 ? '↑' : '↓'} ${pct >= 0 ? '+' : ''}${pct}% vs Budget`);
                        }
                        return lines;
                    },
                },
            },
            datalabels: {
                display: showLabels,
                anchor: 'end',
                align: 'end',
                offset: 6,
                clip: false,
                clamp: true,
                backgroundColor: 'rgba(255,255,255,0.93)',
                borderColor: 'rgba(0,0,0,0.10)',
                borderWidth: 1,
                borderRadius: 6,
                padding: { top: 3, bottom: 3, left: 7, right: 7 },
                color: '#111827',
                font: { size: 11, weight: '700', family: 'Inter, sans-serif' },
                formatter: (value) => value ? fmt(Math.round(value)) : null,
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { maxRotation: 40, font: { size: 11 } } },
            y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v) => fmt(Math.round(v)), font: { size: 11 } } },
        },
    };

    // ── Header buttons ──────────────────────────────────────────────────
    const renderHeaderButtons = (extra = null) => (
        <div className="flex items-center gap-2">
            {extra}
            <button
                onClick={() => setShowLabels(prev => !prev)}
                className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all',
                    showLabels
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 bg-white'
                )}
            >
                <Tag className="w-3.5 h-3.5" /> Labels
            </button>
            <button
                onClick={() => setIsFullScreen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 bg-white transition-all"
            >
                <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
            </button>
        </div>
    );

    if (!chartData || !chartData.datasets?.length) {
        return (
            <div>
                <div className="flex justify-end mb-3">{renderHeaderButtons()}</div>
                <div className="flex items-center justify-center h-64 text-gray-400 italic text-sm">
                    Select at least one business unit.
                </div>
            </div>
        );
    }

    const ChartComponent = chartType === 'line' ? Line : Bar;
    const chartKey = `${chartType}-${metric}-${showLabels}`;

    if (chartType === 'donut') {
        const units = Object.keys(chartData.unitTotals || {}).filter(u => u !== 'All Groups');
        const dataVals = units.map(u => chartData.unitTotals[u] || 0);

        return (
            <div ref={fsRef} className="relative w-full bg-white">
                {isFullScreen && (
                    <div className="absolute inset-0 bg-white flex flex-col" style={{ zIndex: 10 }}>
                        <div className="flex justify-between items-center p-4 flex-shrink-0 border-b border-gray-100">
                            <span className="text-sm font-semibold text-gray-600">Detailed Sales Analysis - Contribution</span>
                            {renderHeaderButtons(
                                <button
                                    onClick={() => setIsFullScreen(false)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" /> Exit
                                </button>
                            )}
                        </div>
                        <div className="flex-1 px-6 pb-6 min-h-0 flex items-center justify-center">
                            <YearlyPieChart labels={units} dataValues={dataVals} />
                        </div>
                    </div>
                )}
                {!isFullScreen && (
                    <>
                        <div className="flex justify-end mb-3">{renderHeaderButtons()}</div>
                        <div className="h-[400px] flex justify-center">
                            <YearlyPieChart labels={units} dataValues={dataVals} />
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div ref={fsRef} className="relative w-full bg-white">
            {isFullScreen && (
                <div className="absolute inset-0 bg-white flex flex-col" style={{ zIndex: 10 }}>
                    <div className="flex justify-between items-center p-4 flex-shrink-0 border-b border-gray-100">
                        <span className="text-sm font-semibold text-gray-600">Detailed Sales Analysis</span>
                        {renderHeaderButtons(
                            <button
                                onClick={() => setIsFullScreen(false)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" /> Exit
                            </button>
                        )}
                    </div>
                    <div className="flex-1 px-6 pb-6 min-h-0">
                        <ChartComponent key={chartKey} data={chartData} options={options} />
                    </div>
                </div>
            )}

            {!isFullScreen && (
                <>
                    <div className="flex justify-end mb-3">{renderHeaderButtons()}</div>
                    <div className="h-[400px]">
                        <ChartComponent key={chartKey} data={chartData} options={options} />
                    </div>
                </>
            )}
        </div>
    );
};

export default DetailsChart;
