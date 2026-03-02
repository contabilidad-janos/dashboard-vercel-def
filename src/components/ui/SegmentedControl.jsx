import React from 'react';
import clsx from 'clsx';

/**
 * SegmentedControl — a pill-button toggle group.
 * @param {Array<{value, label, icon?, disabled?}>} options
 * @param {string} value — currently selected value
 * @param {function} onChange — called with new value
 * @param {string} [size='md'] — 'sm' | 'md'
 */
const SegmentedControl = ({ options, value, onChange, size = 'md', disabled = false }) => {
    const base = 'relative z-10 flex items-center gap-1.5 font-medium transition-all duration-200 select-none cursor-pointer';
    const sizes = {
        sm: 'px-3 py-1 text-xs rounded-md',
        md: 'px-4 py-2 text-sm rounded-lg',
    };

    return (
        <div className={clsx(
            'inline-flex items-center bg-gray-100 rounded-xl p-1 gap-0.5',
            disabled && 'opacity-50 pointer-events-none'
        )}>
            {options.map(opt => {
                const isActive = opt.value === value;
                const isDisabled = opt.disabled;
                return (
                    <button
                        key={opt.value}
                        onClick={() => !isDisabled && onChange(opt.value)}
                        className={clsx(
                            base,
                            sizes[size],
                            isActive
                                ? 'bg-primary text-white shadow-sm'
                                : isDisabled
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-500 hover:text-gray-800 hover:bg-white',
                        )}
                        disabled={isDisabled}
                        title={opt.label}
                    >
                        {opt.icon && <span className="w-4 h-4">{opt.icon}</span>}
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
};

export default SegmentedControl;
