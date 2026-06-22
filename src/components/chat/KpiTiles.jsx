import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/formatters';

/**
 * A row of headline KPI tiles, rendered above the answer for fast reading.
 *
 * Spec shape:
 *   {
 *     type: 'kpi',
 *     kpis: [{ label, value, unit?: '€'|'uds'|'pax'|'%'|'', change?, hint? }],
 *   }
 *   `value` may be a number or a pre-formatted string. `change` is % vs prev.
 */

const fmt = (v, unit) => {
    if (typeof v === 'string') return v; // already formatted by the agent
    if (!Number.isFinite(v)) return v;
    if (unit === '€') return formatCurrency(v);
    if (unit === '%') return `${Number(v).toFixed(1)}%`;
    return `${formatNumber(v)}${unit ? ' ' + unit : ''}`;
};

const KpiTiles = ({ spec }) => {
    const kpis = (spec.kpis || []).filter(k => k && k.label != null && k.value != null);
    if (!kpis.length) return null;

    return (
        <div className="grid gap-2 my-3" style={{ gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, minmax(0, 1fr))` }}>
            {kpis.map((k, i) => {
                const c = k.change;
                const up = Number.isFinite(c) && c > 0;
                const down = Number.isFinite(c) && c < 0;
                const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
                const tone = up ? 'text-emerald-600' : down ? 'text-red-500' : 'text-gray-400';
                return (
                    <div key={i} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                        <div className="text-[10px] uppercase tracking-wide text-gray-400 truncate" title={k.label}>{k.label}</div>
                        <div className="text-lg font-serif text-primary leading-tight mt-0.5">{fmt(k.value, k.unit)}</div>
                        {Number.isFinite(c) && (
                            <div className={`flex items-center gap-1 text-[11px] mt-0.5 ${tone}`}>
                                <Icon className="w-3 h-3" />
                                {c >= 0 ? '+' : ''}{Number(c).toFixed(1)}%
                            </div>
                        )}
                        {k.hint && <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={k.hint}>{k.hint}</div>}
                    </div>
                );
            })}
        </div>
    );
};

export default KpiTiles;
