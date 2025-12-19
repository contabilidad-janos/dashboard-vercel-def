import React, { useState } from 'react';

const Header = () => {
    const [imgError, setImgError] = useState(false);

    return (
        <header className="mb-4 text-center">
            <div className="flex flex-col items-center justify-center mb-4">
                {/* Static Logo Section */}
                <div className="mb-4">
                    {!imgError ? (
                        <img
                            id="dashboardLogo"
                            src="/Captura de pantalla 2025-11-24 095050.png"
                            alt="Juntos Farm Logo"
                            className="h-32 mx-auto object-contain mix-blend-multiply"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div id="textLogoFallback" className="text-center py-4">
                            <div className="font-serif text-6xl text-primary">Juntos</div>
                            <div className="font-sans text-sm tracking-[0.3em] text-primary mt-2 font-semibold">FARM</div>
                        </div>
                    )}
                </div>

                <h1 className="font-serif text-5xl font-bold text-primary tracking-tight">Juntos Sales Dashboard</h1>
            </div>
            <p className="text-lg text-gray-500 mt-2">Interactive Sales Analysis</p>
        </header>
    );
};

export default Header;
