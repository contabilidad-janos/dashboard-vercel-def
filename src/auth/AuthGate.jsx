import React from 'react';
import { useAuth, AUTH_ENABLED } from './AuthContext';

const Shell = ({ children }) => (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="font-serif text-4xl text-primary">Juntos</div>
            <div className="font-sans text-[11px] tracking-[0.3em] text-primary/70 mt-1 mb-6 font-semibold">SALES DASHBOARD</div>
            {children}
        </div>
    </div>
);

const GoogleButton = ({ onClick }) => (
    <button onClick={onClick}
        className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-full border border-gray-200 bg-white hover:border-accent hover:shadow-sm transition-all font-medium text-gray-700">
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
        Entrar con Google
    </button>
);

const AuthGate = ({ children }) => {
    const auth = useAuth();
    if (!AUTH_ENABLED) return children;
    const { state, access, error, signIn, signOut, refresh } = auth;

    if (state === 'loading') {
        return (
            <Shell>
                <div className="flex items-center justify-center gap-3 text-gray-500 py-4">
                    <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Comprobando tu acceso…
                </div>
            </Shell>
        );
    }

    if (state === 'config-error') {
        return (
            <Shell>
                <h1 className="text-lg font-semibold text-gray-800 mb-2">No se pudo verificar el acceso</h1>
                <p className="text-sm text-gray-500 mb-5">{error || 'Error de configuración.'}</p>
                <button onClick={refresh} className="text-sm font-medium text-accent hover:underline">Reintentar</button>
            </Shell>
        );
    }

    if (state === 'signed-out') {
        return (
            <Shell>
                <h1 className="text-lg font-semibold text-gray-800 mb-1">Acceso restringido</h1>
                <p className="text-sm text-gray-500 mb-6">Entra con tu cuenta de Google de la empresa. Si es tu primera vez, un administrador tendrá que aprobarte.</p>
                <GoogleButton onClick={signIn} />
                {error && <p className="text-xs text-red-600 mt-4">{error}</p>}
            </Shell>
        );
    }

    if (state === 'pending') {
        return (
            <Shell>
                <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h1 className="text-lg font-semibold text-gray-800 mb-1">Cuenta pendiente de aprobación</h1>
                <p className="text-sm text-gray-500 mb-2">Hemos registrado tu solicitud con <b className="text-gray-700">{access?.email}</b>.</p>
                <p className="text-sm text-gray-500 mb-6">Un administrador debe aprobarla. Te avisará cuando esté lista.</p>
                <div className="flex items-center justify-center gap-4">
                    <button onClick={refresh} className="text-sm font-medium text-accent hover:underline">Ya me han aprobado</button>
                    <button onClick={signOut} className="text-sm text-gray-400 hover:text-gray-600">Salir</button>
                </div>
            </Shell>
        );
    }

    if (state === 'revoked') {
        return (
            <Shell>
                <h1 className="text-lg font-semibold text-gray-800 mb-1">Acceso revocado</h1>
                <p className="text-sm text-gray-500 mb-6">Tu cuenta <b className="text-gray-700">{access?.email}</b> ya no tiene acceso. Habla con un administrador si crees que es un error.</p>
                <button onClick={signOut} className="text-sm text-gray-400 hover:text-gray-600">Salir</button>
            </Shell>
        );
    }

    return children; // approved
};

export default AuthGate;
