import React from 'react';
import { GitCompare, X } from 'lucide-react';
import DateRangePicker from '../DateRangePicker';
import { presetPreviousPeriod, presetPreviousYear } from '../../utils/compare';

/**
 * Period-B selector for the Best Selling tabs.
 * Renders only when `enabled` is true — the trigger button lives in the
 * parent filters row so the "I want to compare" affordance is obvious
 * without a separate row.
 *
 * Props:
 *   - enabled: bool. When false this component returns null.
 *   - onToggle(false): close the panel
 *   - startA/endA: current Period-A range (for presets)
 *   - startB/endB: current Period-B range
 *   - onChangeB(start, end): fired when user picks or uses a preset
 */
const ComparePanel = ({
    enabled, onToggle,
    startA, endA,
    startB, endB,
    onChangeB,
}) => {
    if (!enabled) return null;

    const applyPrevPeriod = () => {
        const [s, e] = presetPreviousPeriod(startA, endA);
        onChangeB(s, e);
    };
    const applyPrevYear = () => {
        const [s, e] = presetPreviousYear(startA, endA);
        onChangeB(s, e);
    };

    return (
        <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/40">
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider inline-flex items-center gap-1.5">
                    <GitCompare className="w-3 h-3" /> Periodo B (comparar)
                </span>
                <DateRangePicker startDate={startB} endDate={endB} onChange={(s, e) => onChangeB(s, e || startB)} />
                <div className="w-px h-5 bg-amber-300/50" />
                <button
                    onClick={applyPrevPeriod}
                    className="px-3 py-1 text-xs font-medium border border-amber-300 bg-white rounded-full text-amber-700 hover:bg-amber-100 transition-all"
                >Periodo anterior</button>
                <button
                    onClick={applyPrevYear}
                    className="px-3 py-1 text-xs font-medium border border-amber-300 bg-white rounded-full text-amber-700 hover:bg-amber-100 transition-all"
                >Mismo periodo año anterior</button>

                <button
                    onClick={() => onToggle(false)}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"
                    title="Cerrar comparación"
                >
                    <X className="w-3.5 h-3.5" /> Cerrar
                </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
                A = rango principal · B = {startB} → {endB}. Los filtros (departamento, cliente, etc.) se aplican a ambos periodos para que la comparación sea coherente.
            </p>
        </div>
    );
};

/** Small trigger button meant to live inside the date-range row. */
export const CompareToggleButton = ({ enabled, onClick }) => (
    <button
        onClick={onClick}
        title={enabled ? 'Cerrar comparación' : 'Comparar con otro periodo'}
        className={
            'px-3 py-1 text-xs font-medium border rounded-full inline-flex items-center gap-1.5 transition-all ' +
            (enabled
                ? 'border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200'
                : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100')
        }
    >
        <GitCompare className="w-3 h-3" />
        {enabled ? 'Comparando' : 'Comparar periodos'}
    </button>
);

export default ComparePanel;
