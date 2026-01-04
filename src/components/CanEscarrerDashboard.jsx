import React from 'react';

const CanEscarrerDashboard = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12 animate-in fade-in duration-1000">
            <div className="max-w-2xl mx-auto space-y-8">
                {/* Minimalist Header */}
                <h1 className="text-4xl md:text-5xl font-serif text-gray-900 tracking-wide">
                    Best Selling Products
                </h1>

                {/* Elegant Divider */}
                <div className="w-16 h-px bg-gray-400 mx-auto"></div>

                {/* Refined Description */}
                <p className="text-lg md:text-xl text-gray-600 font-light leading-relaxed tracking-wide">
                    We are developing deeper sales analytics, focusing on business unit performance and top-selling products.
                </p>

                <p className="text-sm text-gray-400 font-medium uppercase tracking-widest pt-8">
                    Coming Soon
                </p>
            </div>
        </div>
    );
};

export default CanEscarrerDashboard;
