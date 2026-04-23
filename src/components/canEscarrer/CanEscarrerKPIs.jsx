import React from 'react';
import KPICard from '../KPICard';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { pctDelta } from '../../utils/compare';

const CanEscarrerKPIs = ({ metrics, metricsB = null }) => {
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

    // Only delta on volumetric metrics. Shares + "top X" labels describe
    // structure of A and have no meaningful % delta.
    const dRevenue = metricsB ? pctDelta(totalRevenue, metricsB.totalRevenue) : null;
    const dUnits = metricsB ? pctDelta(totalUnits, metricsB.totalUnits) : null;
    const dAvgLine = metricsB ? pctDelta(avgLineValue, metricsB.avgLineValue) : null;
    const dProducts = metricsB ? pctDelta(activeProducts, metricsB.activeProducts) : null;

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
            <KPICard
                title="Revenue"
                value={formatCurrency(totalRevenue)}
                subtext="in selected range"
                delta={dRevenue}
                deltaLabel="vs B"
            />
            <KPICard
                title="Units Sold"
                value={formatNumber(totalUnits)}
                subtext="total uds."
                delta={dUnits}
                deltaLabel="vs B"
            />
            <KPICard
                title="Avg Line €"
                value={formatCurrency(avgLineValue)}
                subtext="per invoice line"
                delta={dAvgLine}
                deltaLabel="vs B"
            />
            <KPICard
                title="Active Products"
                value={formatNumber(activeProducts)}
                subtext="distinct SKUs"
                delta={dProducts}
                deltaLabel="vs B"
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
