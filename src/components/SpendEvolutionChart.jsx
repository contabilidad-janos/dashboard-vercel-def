import React from 'react';
import { Line } from 'react-chartjs-2';
import { formatCurrency } from '../utils/formatters';

const SpendEvolutionChart = ({ labels, datasets }) => {
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
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
        },
        elements: {
            point: {
                radius: 3,
                hoverRadius: 5
            }
        }
    };

    const data = {
        labels,
        datasets
    };

    return (
        <div className="h-[450px] relative w-full">
            <Line data={data} options={options} />
        </div>
    );
};

export default SpendEvolutionChart;
