import React from 'react';
import clsx from 'clsx';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

/**
 * KPICard.
 * Optional props:
 *   - delta: number (percentage points). Positive → green, negative → red.
 *            Null/undefined hides the row entirely.
 *   - deltaLabel: string shown next to the delta (e.g. "vs B" or "vs 6-12 abr").
 *   - deltaGoodWhenUp: bool. Defaults true. Pass false for metrics where
 *     "up" is bad (unused today but kept for future).
 */
const KPICard = ({ title, value, subtext, color = 'text-[#3D4C41]', delta = null, deltaLabel = null, deltaGoodWhenUp = true }) => {
    const hasDelta = delta != null && Number.isFinite(delta);
    const positive = hasDelta && delta >= 0;
    const goodSign = hasDelta && (positive === deltaGoodWhenUp);

    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm transition transform hover:scale-105">
            <h3 className="text-lg font-medium text-gray-500">{title}</h3>
            <p className={`text-3xl font-bold mt-1 ${color}`}>
                {value}
            </p>
            {subtext && <p className="text-sm text-gray-400">{subtext}</p>}
            {hasDelta && (
                <p className={clsx(
                    'text-xs mt-1 inline-flex items-center gap-0.5 font-semibold',
                    goodSign ? 'text-emerald-600' : 'text-red-600'
                )}>
                    {positive
                        ? <ArrowUpRight className="w-3 h-3" />
                        : <ArrowDownRight className="w-3 h-3" />}
                    {positive ? '+' : ''}{delta.toFixed(1)}%
                    {deltaLabel && <span className="text-gray-400 font-normal ml-1">{deltaLabel}</span>}
                </p>
            )}
        </div>
    );
};

export default KPICard;
