import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { CHART_COLORS } from '../services/dataService';

const YearlyPieChart = ({ labels, dataValues }) => {
    const data = {
        labels: labels,
        datasets: [
            {
                data: dataValues,
                backgroundColor: CHART_COLORS,
                borderColor: '#F9F6F2',
                borderWidth: 4,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            datalabels: { display: false }
        }
    };

    return (
        <div className="h-96 relative w-full">
            <Doughnut data={data} options={options} />
        </div>
    );
};

export default YearlyPieChart;
