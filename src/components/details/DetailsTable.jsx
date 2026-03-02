import React from 'react';
import { Download } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/formatters';

/**
 * DetailsTable — data breakdown table + CSV download.
 */
const DetailsTable = ({ chartData, metric }) => {
    const handleDownloadCSV = () => {
        if (!chartData) return;
        const header = ['Label', ...chartData.datasets.map(d => d.label)].join(',');
        const rows = chartData.labels.map((lbl, i) => {
            const rowData = chartData.datasets.map(d => d.data[i] || 0);
            return [lbl, ...rowData].join(',');
        });
        const csv = 'data:text/csv;charset=utf-8,' + [header, ...rows].join('\n');
        const link = document.createElement('a');
        link.setAttribute('href', encodeURI(csv));
        link.setAttribute('download', `sales_details_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const fmt = (val) => metric === 'transactions' ? formatNumber(val) : formatCurrency(val);

    if (!chartData || !chartData.datasets?.length) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <p className="text-gray-400 italic text-center py-8">No data to display.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-serif text-primary">Data Breakdown</h3>
                <button
                    onClick={handleDownloadCSV}
                    className="inline-flex items-center gap-2 bg-primary hover:bg-opacity-90 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
                >
                    <Download className="w-4 h-4" />
                    Download CSV
                </button>
            </div>

            {/* Scrollable table */}
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="py-3 px-5 text-left font-semibold sticky left-0 bg-gray-50">Dataset</th>
                            {chartData.labels.map((lbl, i) => (
                                <th key={i} className="py-3 px-4 text-right whitespace-nowrap font-semibold">{lbl}</th>
                            ))}
                            <th className="py-3 px-5 text-right font-semibold">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {chartData.datasets.map((ds, i) => {
                            const total = ds.data.reduce((a, b) => a + (Number(b) || 0), 0);
                            const isComparison = ds.borderDash?.length > 0;
                            return (
                                <tr key={i} className={isComparison ? 'bg-gray-50/50 text-gray-500' : 'hover:bg-green-50/30'}>
                                    <td className="py-3 px-5 sticky left-0 bg-inherit">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: Array.isArray(ds.borderColor) ? ds.borderColor[1] : ds.borderColor }}
                                            />
                                            <span className={isComparison ? 'text-gray-500 italic text-xs' : 'font-medium text-gray-800'}>
                                                {ds.label}
                                            </span>
                                        </div>
                                    </td>
                                    {ds.data.map((val, idx) => (
                                        <td key={idx} className="py-3 px-4 text-right tabular-nums">
                                            {fmt(val)}
                                        </td>
                                    ))}
                                    <td className="py-3 px-5 text-right font-semibold tabular-nums">
                                        {fmt(total)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DetailsTable;
