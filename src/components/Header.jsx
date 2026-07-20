import React, { useState } from 'react';
import { exportFullDatabase } from '../utils/exportDatabase';
import UserMenu from '../auth/UserMenu';

const Header = () => {
    const [imgError, setImgError] = useState(false);
    const [exporting, setExporting] = useState('');

    const handleExport = async () => {
        if (exporting) return;
        try {
            setExporting('Preparando…');
            await exportFullDatabase(setExporting);
        } catch (e) {
            console.error('Export DB failed:', e);
            alert('No se pudo generar el Excel: ' + (e.message || e));
        } finally {
            setExporting('');
        }
    };

    return (
        <header className="mb-4 text-center relative">
            {/* Signed-in user + (for admins) the approval panel. Renders nothing
                while VITE_AUTH_ENABLED is off. */}
            <UserMenu />

            {/* Full curated-DB Excel export — the boss reviews things in Excel */}
            <div className="absolute right-0 top-0 z-10">
                <button
                    onClick={handleExport}
                    disabled={!!exporting}
                    title="Descarga toda la base de datos curada del dashboard en un Excel (diario, mensual, anual y productos)"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full border border-gray-200 bg-white text-gray-600 hover:border-accent hover:text-accent shadow-sm transition-all disabled:opacity-60"
                >
                    {exporting ? (
                        <>
                            <span className="inline-block w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                            {exporting}
                        </>
                    ) : (
                        <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
                            </svg>
                            Exportar Excel (BD completa)
                        </>
                    )}
                </button>
            </div>

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
