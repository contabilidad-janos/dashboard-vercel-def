import React from 'react';
import { formatCurrency, formatNumber } from '../utils/formatters';

const KPICard = ({ title, value, subtext, color = 'text-[#3D4C41]', isCurrency = true }) => {
    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm transition transform hover:scale-105">
            <h3 className="text-lg font-medium text-gray-500">{title}</h3>
            <p className={`text-3xl font-bold mt-1 ${color}`}>
                {value}
            </p>
            {subtext && <p className="text-sm text-gray-400">{subtext}</p>}
        </div>
    );
};

export default KPICard;
