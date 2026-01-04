import React from 'react';
import clsx from 'clsx';

const Tabs = ({ activeTab, onTabChange }) => {
    const tabs = [
        { id: '2026', label: '2026 Overview' },
        { id: '2025', label: '2025 Overview' },
        { id: '2024', label: '2024 Overview' },
        { id: 'details', label: 'Detailed Sales & Comparison' },
        { id: 'can-escarrer', label: 'Best Selling Products' },
    ];

    return (
        <nav className="mb-8 flex flex-wrap justify-center border-b border-gray-200">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={clsx(
                        'py-4 px-6 block focus:outline-none transition-colors duration-200',
                        activeTab === tab.id ? 'tab-active' : 'tab-inactive'
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </nav>
    );
};

export default Tabs;
