import React, { useState } from 'react';
import clsx from 'clsx';
import PicadeliProducts from './PicadeliProducts';
import CanEscarrerProducts from './CanEscarrerProducts';

// BU selector for the Best Selling Products tab.
// Picadeli is its own table (picadeli_sales); the other three all live in
// can_escarrer_sales filtered by the `bu` column.
const BUS = [
    { key: 'picadeli',     label: 'Picadeli' },
    { key: 'DISTRIBUCION', label: 'Distribución' },
    { key: 'SHOP',         label: 'Shop' },
    { key: 'TASTING',      label: 'Tasting' },
];

const BestSellingProducts = () => {
    const [bu, setBu] = useState('picadeli');

    return (
        <div className="animate-in fade-in duration-500">
            {/* BU selector */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Unidad</span>
                {BUS.map(b => (
                    <button
                        key={b.key}
                        onClick={() => setBu(b.key)}
                        className={clsx(
                            'px-4 py-1.5 text-sm font-medium rounded-full border transition-all',
                            bu === b.key
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-accent hover:text-accent'
                        )}
                    >{b.label}</button>
                ))}
            </div>

            {bu === 'picadeli'
                ? <PicadeliProducts />
                : <CanEscarrerProducts bu={bu} />
            }
        </div>
    );
};

export default BestSellingProducts;
