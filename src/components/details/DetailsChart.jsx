import React from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import clsx from 'clsx';

/**
 * DetailsChart — renders the Line or Bar chart with data labels.
 * Receives pre-computed chartData and display options.
 */
const DetailsChart = ({ chartData, chartType, metric, showLabels, isFullScreen, selectedYear }) => {
    if (!chartData) return null;

    const yTickCallback = (val) => metric === 'transactions' ? val : formatCurrency(val);

    const datalabelsFormatter = (value, context) => {
        if (!value) return '';
        const formattedValue = metric === 'transactions' ? formatNumber(value) : formatCurrency(value);
        const label = context.dataset.label || '';

        if (label.includes("'25") || label.includes("'26") || label === 'All Groups') {
            const datasets = context.chart.data.datasets;
            const idx = context.dataIndex;
            const lines = [formattedValue];

            const prevYearShort = selectedYear === '2026' ? "'25" : "'24";
            const dsPrev = datasets.find(d => d.label?.includes(prevYearShort));
            if (dsPrev?.data[idx]) {
                const pct = Math.round(((value - dsPrev.data[idx]) / dsPrev.data[idx]) * 100);
                lines.push(`vs ${prevYearShort}: ${pct >= 0 ? '+' : ''}${pct}%`);
            }

            const dsBud = datasets.find(d => d.label?.includes('Budget'));
            if (dsBud?.data[idx]) {
                const pct = Math.round(((value - dsBud.data[idx]) / dsBud.data[idx]) * 100);
                lines.push(`vs Bud: ${pct >= 0 ? '+' : ''}${pct}%`);
            }

            return lines;
        }
        return formattedValue;
    };

    const commonOptions = {
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            datalabels: {
                display: showLabels,
                anchor: 'end',
                align: 'top',
                font: { size: 11, weight: 'bold' },
                color: '#374151',
                formatter: datalabelsFormatter,
            },
        },
        scales: { y: { ticks: { callback: yTickCallback } } },
    };

    const lineOptions = {
        ...commonOptions,
        plugins: {
            ...commonOptions.plugins,
            datalabels: {
                ...commonOptions.plugins.datalabels,
                align: 'top',
                formatter: (val) => metric === 'transactions' ? formatNumber(val) : formatCurrency(val),
            },
        },
    };

    return (
        <div className={clsx('relative w-full', isFullScreen ? 'h-[70vh]' : 'h-[450px]')}>
            {chartType === 'line'
                ? <Line data={chartData} options={lineOptions} />
                : <Bar data={chartData} options={commonOptions} />
            }
        </div>
    );
};

export default DetailsChart;
