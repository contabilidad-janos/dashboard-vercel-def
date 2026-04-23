import React from 'react';
import KPICard from '../KPICard';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const CanEscarrerKPIs = ({ metrics }) => {
    const {
        totalRevenue = 0,
        totalUnits = 0,
        avgLineValue = 0,
        activeProducts = 0,
        externalShare = 0,
        topProductShare = 0,
        topProductName = '—',
        topClientName = '—',
        topClientShare = 0,
    } = metrics || {};

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
            <KPICard
                title="Revenue"
                value={formatCurrency(totalRevenue)}
                subtext="in selected range"
            />
            <KPICard
                title="Units Sold"
                value={formatNumber(totalUnits)}
                subtext="total uds."
            />
            <KPICard
                title="Avg Line €"
                value={formatCurrency(avgLineValue)}
                subtext="per invoice line"
            />
            <KPICard
                title="Active Products"
                value={formatNumber(activeProducts)}
                subtext="distinct SKUs"
            />
            <KPICard
                title="% Externo"
                value={`${Math.round(externalShare)}%`}
                subtext="vs. consumo interno"
            />
            <KPICard
                title="Top Product"
                value={`${Math.round(topProductShare)}%`}
                subtext={topProductName}
            />
            <KPICard
                title="Top Cliente"
                value={`${Math.round(topClientShare)}%`}
                subtext={topClientName}
            />
        </div>
    );
};

export default CanEscarrerKPIs;
