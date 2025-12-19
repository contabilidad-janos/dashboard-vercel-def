import React from 'react';
import { Bar } from 'react-chartjs-2';
import { formatCurrency } from '../utils/formatters';

const YearlyBarChart = ({ labels, datasets }) => {
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                stacked: true,
                grid: { display: false }
            },
            y: {
                stacked: true,
                grace: '10%',
                ticks: { callback: (value) => formatCurrency(value) }
            }
        },
        plugins: {
            legend: { position: 'bottom', labels: { padding: 15 } },
            datalabels: { display: false },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += formatCurrency(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        }
    };

    const data = {
        labels,
        datasets
    };

    return (
        <div className="h-96 relative w-full">
            <Bar data={data} options={options} />
        </div>
    );
};

export default YearlyBarChart;
