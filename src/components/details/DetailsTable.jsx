import React from 'react';
import { Download } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/formatters';

/**
 * DetailsTable — data breakdown table + CSV download button.
 */
const DetailsTable = ({ chartData, metric }) => {
    const handleDownloadCSV = () => {
        if (!chartData) return;
        const header = ['Label', ...chartData.datasets.map(d => d.label)].join(',');
        const rows = chartData.labels.map((lbl, i) => {
            const rowData = chartData.datasets.map(d => d.data[i] || 0);
            return [lbl, ...rowData].join(',');
        });
        const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...rows].join('\n');
        const link = document.createElement('a');
        link.setAttribute('href', encodeURI(csvContent));
        link.setAttribute('download', `sales_data_details_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-serif text-primary">Data Breakdown</h3>
                <button
                    onClick={handleDownloadCSV}
                    className="bg-primary hover:bg-opacity-90 text-white font-medium py-2 px-4 rounded inline-flex items-center transition cursor-pointer"
                >
                    <Download className="w-4 h-4 mr-2" />
                    Download CSV
                </button>
            </div>

            {chartData && chartData.datasets.length > 0 ? (
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                        <tr>
                            <th className="py-3 px-4">Metric / Unit</th>
                            {chartData.labels.map((label, i) => (
                                <th key={i} className="py-3 px-4 whitespace-nowrap">{label}</th>
                            ))}
                            <th className="py-3 px-4 font-bold">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {chartData.datasets.map((dataset, i) => {
                            const rowTotal = dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
                            return (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="py-3 px-4 font-medium text-gray-800 flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: dataset.borderColor || dataset.backgroundColor }} />
                                        {dataset.label}
                                    </td>
                                    {dataset.data.map((val, idx) => (
                                        <td key={idx} className="py-3 px-4">
                                            {metric === 'transactions' ? formatNumber(val) : formatCurrency(val)}
                                        </td>
                                    ))}
                                    <td className="py-3 px-4 font-bold">
                                        {metric === 'transactions' ? formatNumber(rowTotal) : formatCurrency(rowTotal)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            ) : (
                <div className="text-gray-500 italic py-8 text-center">Select units to view data.</div>
            )}
        </div>
    );
};

export default DetailsTable;
