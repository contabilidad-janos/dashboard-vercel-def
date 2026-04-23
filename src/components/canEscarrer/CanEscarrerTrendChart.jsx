import React, { useState, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import clsx from 'clsx';

const CanEscarrerTrendChart = ({ monthly, weekday }) => {
    const [mode, setMode] = useState('revenue'); // revenue | units
    const [axis, setAxis] = useState('month');    // month | weekday

    const { labels, data } = useMemo(() => {
        const src = axis === 'month' ? monthly : weekday;
        return {
            labels: src?.labels || [],
            data: (mode === 'revenue' ? src?.revenue : src?.units) || [],
        };
    }, [axis, mode, monthly, weekday]);

    const chartData = useMemo(() => ({
        labels,
        datasets: [{
            label: mode === 'revenue' ? 'Revenue €' : 'Units',
            data,
            backgroundColor: '#6E8C71',
            borderColor: '#6E8C71',
            borderWidth: 1,
        }],
    }), [labels, data, mode]);

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
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="text-lg font-serif text-primary">
                    {axis === 'month' ? 'Evolución mensual' : 'Patrón por día de la semana'}
                </h3>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                        {[
                            { v: 'month', l: 'Mes' },
                            { v: 'weekday', l: 'Día semana' },
                        ].map(opt => (
                            <button
                                key={opt.v}
                                onClick={() => setAxis(opt.v)}
                                className={clsx(
                                    'px-3 py-1 text-xs font-medium rounded-md transition',
                                    axis === opt.v ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                )}
                            >{opt.l}</button>
                        ))}
                    </div>
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
            </div>
            <div className="h-[320px]">
                <Bar data={chartData} options={options} />
            </div>
        </div>
    );
};

export default CanEscarrerTrendChart;
