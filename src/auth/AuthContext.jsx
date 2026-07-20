import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { clearDataCache } from '../services/dataService';

// Session + approval state for the whole app.
//
// Auth is behind VITE_AUTH_ENABLED so the gate can ship before Google is
// configured in Supabase: with the flag off everything renders exactly as
// before. Flip it to "true" once Authentication → Providers → Google is set up.
export const AUTH_ENABLED = String(import.meta.env.VITE_AUTH_ENABLED || '').toLowerCase() === 'true';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// loading | disabled | signed-out | pending | revoked | approved | config-error
export const AuthProvider = ({ children }) => {
    const [state, setState] = useState(AUTH_ENABLED ? 'loading' : 'disabled');
    const [session, setSession] = useState(null);
    const [access, setAccess] = useState(null);   // row from public.app_access
    const [error, setError] = useState(null);

    const loadAccess = useCallback(async (sess) => {
        if (!sess?.user) { setAccess(null); setState('signed-out'); return; }
        const { data, error: e } = await supabase
            .from('app_access')
            .select('user_id, email, full_name, avatar_url, status, role')
            .eq('user_id', sess.user.id)
            .maybeSingle();
        if (e) { setError(e.message); setState('config-error'); return; }
        if (!data) {
            // Trigger hasn't produced the row yet (first login race) — treat as pending.
            setAccess({ email: sess.user.email, status: 'pending', role: 'viewer' });
            setState('pending');
            return;
        }
        setAccess(data);
        setState(data.status === 'approved' ? 'approved' : data.status === 'revoked' ? 'revoked' : 'pending');
        if (data.status === 'approved') {
            supabase.from('app_access').update({ last_seen_at: new Date().toISOString() })
                .eq('user_id', sess.user.id).then(() => { }, () => { });
        }
    }, []);

    useEffect(() => {
        if (!AUTH_ENABLED) return;
        if (!supabase) { setError('Faltan las variables de entorno de Supabase.'); setState('config-error'); return; }

        let cancelled = false;
        // Nothing renders until this resolves — otherwise the dashboard's
        // effects fire without a JWT and poison DataService's cache with empties.
        (async () => {
            const { data } = await supabase.auth.getSession();
            if (cancelled) return;
            setSession(data.session);
            await loadAccess(data.session);
        })();

        const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
            if (cancelled) return;
            setSession(sess);
            if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') clearDataCache();
            await loadAccess(sess);
        });
        return () => { cancelled = true; sub?.subscription?.unsubscribe(); };
    }, [loadAccess]);

    const signIn = useCallback(async () => {
        if (!supabase) return;
        const { error: e } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
        });
        if (e) setError(e.message);
    }, []);

    const signOut = useCallback(async () => {
        clearDataCache();
        await supabase?.auth.signOut();
    }, []);

    const refresh = useCallback(async () => {
        const { data } = await supabase.auth.getSession();
        await loadAccess(data.session);
    }, [loadAccess]);

    return (
        <AuthContext.Provider value={{ state, session, access, error, signIn, signOut, refresh, isAdmin: access?.role === 'admin' && access?.status === 'approved' }}>
            {children}
        </AuthContext.Provider>
    );
};
