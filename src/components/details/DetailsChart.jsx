import React from 'react';
import { Bar, Line } from 'react-chartjs-2';
import YearlyPieChart from '../YearlyPieChart';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const DetailsChart = ({ chartData, filters, metric, chartType }) => {

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    padding: 20,
                    font: {
                        family: "'Inter', sans-serif",
                        size: 12
                    }
                }
            },
            datalabels: {
                color: '#fff',
                font: {
                    weight: 'bold',
                    size: 11
                },
                formatter: (value) => {
                    if (value === 0) return '';
                    if (metric === 'transactions') return formatNumber(value);
                    if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
                    return value;
                },
                display: function (context) {
                    const dataset = context.dataset;
                    if (dataset.type === 'line' || dataset.label === 'Budget') {
                        return false;
                    }
                    return context.chart.width > 500; // Hide labels on small screens
                }
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += metric === 'transactions'
                                ? formatNumber(context.parsed.y)
                                : formatCurrency(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                stacked: chartType === 'stacked-bar',
                grid: {
                    display: false,
                },
                ticks: {
                    font: {
                        family: "'Inter', sans-serif"
                    }
                }
            },
            y: {
                stacked: chartType === 'stacked-bar',
                beginAtZero: true,
                grid: {
                    color: '#f3f4f6',
                },
                ticks: {
                    font: {
                        family: "'Inter', sans-serif"
                    },
                    callback: function (value) {
                        if (metric === 'transactions') return formatNumber(value);
                        if (value >= 1000) return '€' + (value / 1000) + 'k';
                        return '€' + value;
                    }
                }
            }
        },
        interaction: {
            mode: 'index',
            intersect: false,
        },
    };

    // If Donut chart is selected, render YearlyPieChart instead
    if (chartType === 'donut') {
        const pieLabels = Object.keys(chartData.unitTotals);
        const pieData = Object.values(chartData.unitTotals);

        return (
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mt-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="font-serif text-2xl font-semibold text-primary">Contribution Analysis (Donut)</h2>
                </div>
                <YearlyPieChart
                    labels={pieLabels}
                    dataValues={pieData}
                    metric={metric}
                />
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mt-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="font-serif text-2xl font-semibold text-primary">
                    {filters.viewMode === 'monthly' ? 'Monthly' : (filters.viewMode === 'weekly' ? 'Weekly' : 'Daily')} Trend Analysis
                </h2>
                <div className="text-sm text-gray-500">
                    Source: Aggregated Data ({filters.selectedYear})
                </div>
            </div>

            <div className="h-[450px] relative">
                {chartType === 'line' ? (
                    <Line data={chartData} options={chartOptions} />
                ) : (
                    <Bar data={chartData} options={chartOptions} />
                )}
            </div>
        </div>
    );
};

export default DetailsChart;
