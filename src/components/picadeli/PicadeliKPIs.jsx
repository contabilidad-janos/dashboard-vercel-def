import React from 'react';
import KPICard from '../KPICard';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const PicadeliKPIs = ({ metrics }) => {
    const {
        totalRevenue = 0,
        totalUnits = 0,
        avgLineValue = 0,
        activeProducts = 0,
        topProductShare = 0,
        topProductName = '—',
        bestHour = null,
        bestHourShare = 0,
        publicShare = 0,
    } = metrics || {};

    const hourLabel = bestHour == null ? '—' : `${String(bestHour).padStart(2, '0')}:00`;

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
                subtext="per transaction line"
            />
            <KPICard
                title="Active Products"
                value={formatNumber(activeProducts)}
                subtext="distinct SKUs"
            />
            <KPICard
                title="% Público"
                value={`${Math.round(publicShare)}%`}
                subtext="público vs. nombrado"
            />
            <KPICard
                title="Top Product"
                value={`${Math.round(topProductShare)}%`}
                subtext={topProductName}
            />
            <KPICard
                title="Best Hour"
                value={hourLabel}
                subtext={`${Math.round(bestHourShare)}% of revenue`}
            />
        </div>
    );
};

export default PicadeliKPIs;
