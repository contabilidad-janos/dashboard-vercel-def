import React from 'react';
import KPICard from '../KPICard';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { pctDelta } from '../../utils/compare';

const PicadeliKPIs = ({ metrics, metricsB = null }) => {
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

    // Deltas are shown on the 3 metrics that make sense to compare across
    // periods: revenue, units, avg line €. The other four (shares, best hour,
    // top product name) aren't deltas — they describe structure.
    const dRevenue = metricsB ? pctDelta(totalRevenue, metricsB.totalRevenue) : null;
    const dUnits   = metricsB ? pctDelta(totalUnits, metricsB.totalUnits) : null;
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
                subtext="per transaction line"
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
