import React from 'react';
import clsx from 'clsx';
import DateRangePicker from '../DateRangePicker';
import { Search } from 'lucide-react';

const PRESETS = [
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
    { value: 'ytd', label: 'YTD' },
    { value: '12m', label: 'Last 12m' },
    { value: 'all', label: 'All time' },
];

const PicadeliFilters = ({
    startDate, endDate, onDateChange,
    onPreset,
    departamentos, selectedDeps, toggleDep,
    secciones, selectedSecs, toggleSec,
    marcas, selectedMarcas, setSelectedMarcas,
    search, setSearch,
}) => {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">

            {/* Row 1: Date range + presets */}
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date Range</span>
                <DateRangePicker startDate={startDate} endDate={endDate} onChange={onDateChange} />
                <div className="w-px h-5 bg-gray-200" />
                {PRESETS.map(p => (
                    <button
                        key={p.value}
                        onClick={() => onPreset(p.value)}
                        className="px-3 py-1 text-xs font-medium border border-gray-300 rounded-full text-gray-600 hover:border-accent hover:text-accent hover:bg-accent/5 transition-all"
                    >{p.label}</button>
                ))}
            </div>

            {/* Row 2: Departamento chips */}
            <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Departamento</p>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => toggleDep('__ALL__')}
                        className={clsx('bu-chip font-semibold', selectedDeps.length === 0 && 'active')}
                    >All</button>
                    {departamentos.map(d => (
                        <button key={d} onClick={() => toggleDep(d)} className={clsx('bu-chip', selectedDeps.includes(d) && 'active')}>{d}</button>
                    ))}
                </div>
            </div>

            {/* Row 3: Sección chips (filtered by Departamento when one is selected) */}
            {secciones.length > 0 && (
                <div className="px-5 py-3 border-b border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Sección</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => toggleSec('__ALL__')}
                            className={clsx('bu-chip font-semibold text-xs', selectedSecs.length === 0 && 'active')}
                        >All</button>
                        {secciones.map(s => (
                            <button key={s} onClick={() => toggleSec(s)} className={clsx('bu-chip text-xs', selectedSecs.includes(s) && 'active')}>{s}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* Row 4: Marca + search */}
            <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-gray-50/50">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Proveedor</span>
                <select
                    value={selectedMarcas[0] || ''}
                    onChange={e => setSelectedMarcas(e.target.value ? [e.target.value] : [])}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:ring-1 focus:ring-accent focus:outline-none bg-white"
                >
                    <option value="">All suppliers</option>
                    {marcas.map(m => (<option key={m} value={m}>{m}</option>))}
                </select>

                <div className="w-px h-5 bg-gray-200" />

                <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search product..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:ring-1 focus:ring-accent focus:outline-none bg-white"
                    />
                </div>
            </div>
        </div>
    );
};

export default PicadeliFilters;
