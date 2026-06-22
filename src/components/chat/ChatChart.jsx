import React, { useState } from 'react';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import { Maximize2, X } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import BubbleField from './BubbleField';
import KpiTiles from './KpiTiles';

// Dashboard palette
const PALETTE = ['#6E8C71', '#B09B80', '#D9825F', '#E8C89A', '#879FA8', '#566E7A', '#C4BFAA', '#A9A9A9'];

const COMP = { bar: Bar, line: Line, pie: Pie, doughnut: Doughnut };

const formatValue = (v, unit) => {
    if (!Number.isFinite(v)) return v;
    if (unit === '€') return formatCurrency(v);
    if (unit === '%') return `${Number(v).toFixed(1)}%`;
    return `${formatNumber(v)}${unit ? ' ' + unit : ''}`;
};

/**
 * Render a chart from an assistant-emitted JSON spec.
 *
 * Spec shape:
 *   {
 *     type: 'bar' | 'line' | 'pie' | 'doughnut',
 *     title?: string,
 *     labels: string[],
 *     values?: number[],                          // single series
 *     datasets?: [{ name, values, color? }],      // multi series
 *     unit?: '€' | 'uds' | 'pax' | '%' | '',
 *   }
 */
const ChatChart = ({ spec, onDrill }) => {
    const [full, setFull] = useState(false);

    // Specialised renderers for the non-cartesian spec types.
    if (spec.type === 'bubble') return <BubbleField spec={spec} onDrill={onDrill} />;
    if (spec.type === 'kpi') return <KpiTiles spec={spec} />;

    const drillFor = (label) =>
        (spec.drill ? spec.drill.replace('{label}', label) : `Break down "${label}" in more detail`);

    const datasets = (spec.datasets && spec.datasets.length)
        ? spec.datasets
        : [{ name: spec.title || 'Serie', values: spec.values || [] }];

    const isPie = spec.type === 'pie' || spec.type === 'doughnut';

    const data = {
        labels: spec.labels || [],
        datasets: datasets.map((ds, i) => ({
            label: ds.name || `Serie ${i + 1}`,
            data: ds.values || [],
            backgroundColor: isPie
                ? (ds.values || []).map((_, j) => PALETTE[j % PALETTE.length])
                : (ds.color || PALETTE[i % PALETTE.length]),
            borderColor: isPie ? '#fff' : (ds.color || PALETTE[i % PALETTE.length]),
            borderWidth: isPie ? 1 : 2,
            tension: spec.type === 'line' ? 0.3 : undefined,
            fill: spec.type === 'line' ? false : undefined,
        })),
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        onClick: onDrill ? (_evt, elements) => {
            if (!elements?.length) return;
            const label = (spec.labels || [])[elements[0].index];
            if (label != null) onDrill(drillFor(String(label)));
        } : undefined,
        onHover: onDrill ? (evt, elements) => {
            if (evt?.native?.target) evt.native.target.style.cursor = elements?.length ? 'pointer' : 'default';
        } : undefined,
        plugins: {
            legend: { display: isPie || datasets.length > 1, position: 'bottom', labels: { font: { size: 11 } } },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const v = ctx.parsed?.y ?? ctx.parsed;
                        return ` ${ctx.dataset.label}: ${formatValue(v, spec.unit)}`;
                    },
                },
            },
            datalabels: { display: false },
        },
        scales: isPie ? undefined : {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: {
                grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: {
                    font: { size: 10 },
                    callback: (v) => formatValue(v, spec.unit),
                },
            },
        },
    };

    const Chart = COMP[spec.type] || Bar;

    const card = (height) => (
        <div className="bg-white border border-gray-200 rounded-lg p-4 my-3">
            <div className="flex items-start justify-between mb-2 gap-3">
                {spec.title && <h4 className="text-sm font-serif text-primary">{spec.title}</h4>}
                {!full && (
                    <button
                        onClick={() => setFull(true)}
                        className="text-gray-400 hover:text-primary p-1 -mt-1 -mr-1"
                        title="Expand"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            <div style={{ height }}>
                <Chart data={data} options={options} />
            </div>
        </div>
    );

    if (!full) return card(260);

    return (
        <>
            {card(260)}
            <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6" onClick={() => setFull(false)}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] p-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between mb-3">
                        <h3 className="font-serif text-xl text-primary">{spec.title || 'Chart'}</h3>
                        <button onClick={() => setFull(false)} className="text-gray-400 hover:text-gray-700 p-1">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <Chart data={data} options={options} />
                    </div>
                </div>
            </div>
        </>
    );
};

export default ChatChart;
