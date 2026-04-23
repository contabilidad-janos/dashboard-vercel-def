import React, { useState } from 'react';
import clsx from 'clsx';
import DateRangePicker from '../DateRangePicker';
import { Search, UserX, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { CompareToggleButton } from '../shared/ComparePanel';

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
    clientOptions = [], excludedClients = [], toggleClient,
    onExcludeInternal, onClearExcludedClients,
    search, setSearch,
    compareSlot = null,
    compareEnabled = false,
    onToggleCompare = null,
}) => {
    const [showAllClients, setShowAllClients] = useState(false);
    const namedClients = clientOptions.filter(c => !c.isPublic);
    const visibleClients = showAllClients ? namedClients : namedClients.slice(0, 12);
    const clientLabel = (c) => c.cliente === '' ? '(sin cliente)' : c.cliente;
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
                {onToggleCompare && (
                    <>
                        <div className="w-px h-5 bg-gray-200" />
                        <CompareToggleButton
                            enabled={compareEnabled}
                            onClick={() => onToggleCompare(!compareEnabled)}
                        />
                    </>
                )}
            </div>

            {/* Compare (Period B) — expanded panel, renders only when enabled */}
            {compareSlot}

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

            {/* Row 3.5: Client exclusion (internal consumption) */}
            {namedClients.length > 0 && (
                <div className="px-5 py-3 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-2 gap-3">
                        <div className="flex items-center gap-2">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Excluir clientes (consumo interno / B2B)</p>
                            {excludedClients.length > 0 && (
                                <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                                    {excludedClients.length} excluido{excludedClients.length === 1 ? '' : 's'}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onExcludeInternal}
                                className="inline-flex items-center gap-1.5 text-[11px] font-medium border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-full px-2.5 py-1"
                            >
                                <UserX className="w-3 h-3" /> Excluir internos (Christian + Empleados)
                            </button>
                            {excludedClients.length > 0 && (
                                <button
                                    onClick={onClearExcludedClients}
                                    className="text-[11px] text-gray-500 hover:text-gray-700 underline"
                                >Limpiar</button>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {visibleClients.map(c => {
                            const excluded = excludedClients.includes(c.cliente);
                            return (
                                <button
                                    key={c.cliente}
                                    onClick={() => toggleClient(c.cliente)}
                                    title={`${clientLabel(c)} — ${formatCurrency(c.revenue)}`}
                                    className={clsx(
                                        'inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 transition-colors',
                                        excluded
                                            ? 'bg-red-50 border-red-300 text-red-700 line-through'
                                            : 'bg-white border-gray-200 text-gray-700 hover:border-accent hover:text-accent'
                                    )}
                                >
                                    <span className="max-w-[220px] truncate">{clientLabel(c)}</span>
                                    <span className="text-[10px] text-gray-400">{formatCurrency(c.revenue)}</span>
                                </button>
                            );
                        })}
                        {namedClients.length > 12 && (
                            <button
                                onClick={() => setShowAllClients(s => !s)}
                                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-accent px-2"
                            >
                                {showAllClients
                                    ? <>Ver menos <ChevronUp className="w-3 h-3" /></>
                                    : <>+{namedClients.length - 12} más <ChevronDown className="w-3 h-3" /></>}
                            </button>
                        )}
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
