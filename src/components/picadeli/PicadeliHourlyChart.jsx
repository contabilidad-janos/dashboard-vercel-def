import React, { useState, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import clsx from 'clsx';

const PicadeliHourlyChart = ({ hourly }) => {
    const [mode, setMode] = useState('revenue'); // revenue | units

    const { labels, revenue, units } = hourly;

    const chartData = useMemo(() => ({
        labels,
        datasets: [{
            label: mode === 'revenue' ? 'Revenue €' : 'Units',
            data: mode === 'revenue' ? revenue : units,
            backgroundColor: '#D9825F',
            borderColor: '#D9825F',
            borderWidth: 1,
        }],
    }), [labels, revenue, units, mode]);

    const options = {
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const v = ctx.parsed.y;
                        return mode === 'revenue' ? ` ${formatCurrency(v)}` : ` ${formatNumber(v)} uds`;
                    },
                },
            },
            datalabels: { display: false },
        },
        scales: {
            x: { grid: { display: false } },
            y: {
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: {
                    callback: v => mode === 'revenue' ? formatCurrency(v) : formatNumber(v),
                },
            },
        },
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-serif text-primary">Best hours of the day</h3>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {['revenue', 'units'].map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={clsx(
                                'px-3 py-1 text-xs font-medium rounded-md transition',
                                mode === m ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            )}
                        >{m === 'revenue' ? 'Revenue' : 'Units'}</button>
                    ))}
                </div>
            </div>
            <div className="h-[320px]">
                <Bar data={chartData} options={options} />
            </div>
        </div>
    );
};

export default PicadeliHourlyChart;
