import React from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import clsx from 'clsx';

/**
 * DetailsChart — renders the Line or Bar chart.
 * Pure display component: receives pre-computed chartData.
 */
const DetailsChart = ({ chartData, chartType, metric, showLabels, isFullScreen, selectedYear }) => {
    if (!chartData || !chartData.datasets?.length) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400 italic">
                Select at least one business unit to display data.
            </div>
        );
    }

    const yTickCallback = (val) =>
        metric === 'transactions' ? formatNumber(val) : formatCurrency(val);

    const buildDatalabelsFormatter = (isBar) => (value, context) => {
        if (!value) return '';
        const label = context.dataset.label || '';
        const formatted = metric === 'transactions' ? formatNumber(value) : formatCurrency(value);

        // Only show % comparisons on current-year datasets (bar chart)
        if (!isBar) return formatted;
        const isCurrent = label.includes("'25") || label.includes("'26")
            || label === 'All Groups' || (label.startsWith('All Groups') && !label.includes("'"));
        if (!isCurrent) return formatted;

        const datasets = context.chart.data.datasets;
        const idx = context.dataIndex;
        const lines = [formatted];

        const prevShort = selectedYear === '2026' ? "'25" : "'24";
        const dsPrev = datasets.find(d => d.label?.includes(prevShort));
        if (dsPrev?.data[idx]) {
            const pct = Math.round(((value - dsPrev.data[idx]) / dsPrev.data[idx]) * 100);
            lines.push(`vs ${prevShort}: ${pct >= 0 ? '+' : ''}${pct}%`);
        }

        const dsBud = datasets.find(d => d.label?.includes('Budget'));
        if (dsBud?.data[idx]) {
            const pct = Math.round(((value - dsBud.data[idx]) / dsBud.data[idx]) * 100);
            lines.push(`vs Bud: ${pct >= 0 ? '+' : ''}${pct}%`);
        }

        return lines;
    };

    const baseOptions = {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const val = ctx.parsed.y;
                        const formatted = metric === 'transactions' ? formatNumber(val) : formatCurrency(val);
                        return ` ${ctx.dataset.label}: ${formatted}`;
                    },
                },
            },
            datalabels: {
                display: showLabels,
                anchor: 'end',
                align: 'top',
                font: { size: 10, weight: '600' },
                color: '#374151',
                formatter: buildDatalabelsFormatter(chartType === 'bar'),
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { maxRotation: 45, font: { size: 11 } },
            },
            y: {
                grid: { color: 'rgba(0,0,0,0.04)' },
                ticks: { callback: yTickCallback, font: { size: 11 } },
            },
        },
    };

    return (
        <div className={clsx(
            'relative w-full transition-all',
            isFullScreen ? 'h-[65vh]' : 'h-[420px]'
        )}>
            {chartType === 'line'
                ? <Line data={chartData} options={baseOptions} />
                : <Bar  data={chartData} options={baseOptions} />
            }
        </div>
    );
};

export default DetailsChart;
