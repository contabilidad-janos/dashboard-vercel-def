import React, { useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import { supabase } from '../services/supabaseClient';
import { useAuth, AUTH_ENABLED } from './AuthContext';

// Avatar + sign-out, plus the owner's approval panel (only rendered for admins).
const UserMenu = () => {
    const auth = useAuth();
    const [open, setOpen] = useState(false);
    const [panel, setPanel] = useState(false);
    const [users, setUsers] = useState([]);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState(null);

    const isAdmin = auth?.isAdmin;

    const loadUsers = useCallback(async () => {
        const { data, error } = await supabase
            .from('app_access')
            .select('user_id, email, full_name, avatar_url, status, role, requested_at, last_seen_at')
            .order('requested_at', { ascending: false });
        if (error) { setErr(error.message); return; }
        setUsers(data || []);
    }, []);

    useEffect(() => { if (panel && isAdmin) loadUsers(); }, [panel, isAdmin, loadUsers]);

    const pendingCount = users.filter(u => u.status === 'pending').length;

    // Poll for pending requests so the owner sees a badge without reloading.
    useEffect(() => {
        if (!isAdmin) return;
        loadUsers();
        const t = setInterval(loadUsers, 60000);
        return () => clearInterval(t);
    }, [isAdmin, loadUsers]);

    const decide = async (target, status, role) => {
        setBusy(target); setErr(null);
        const { error } = await supabase.rpc('set_user_access', { target, new_status: status, new_role: role ?? null });
        if (error) setErr(error.message);
        await loadUsers();
        setBusy(null);
    };

    if (!AUTH_ENABLED || !auth?.access) return null;
    const { access, signOut } = auth;
    const initials = (access.full_name || access.email || '?').trim().charAt(0).toUpperCase();

    return (
        <div className="absolute left-0 top-0 z-20">
            <div className="flex items-center gap-2">
                <button onClick={() => setOpen(o => !o)}
                    className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-gray-200 bg-white hover:border-accent transition-all shadow-sm">
                    {access.avatar_url
                        ? <img src={access.avatar_url} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                        : <span className="w-7 h-7 rounded-full bg-primary text-white text-xs font-semibold flex items-center justify-center">{initials}</span>}
                    <span className="text-sm text-gray-600 max-w-[160px] truncate">{access.full_name || access.email}</span>
                </button>
                {isAdmin && (
                    <button onClick={() => setPanel(true)}
                        className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-gray-200 bg-white text-gray-600 hover:border-accent hover:text-accent transition-all shadow-sm">
                        Usuarios
                        {pendingCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{pendingCount}</span>
                        )}
                    </button>
                )}
            </div>

            {open && (
                <div className="mt-2 w-64 bg-white rounded-xl border border-gray-100 shadow-lg p-3 text-left">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Sesión</div>
                    <div className="text-sm text-gray-700 truncate">{access.email}</div>
                    <div className="text-[11px] text-gray-400 mb-3">{access.role === 'admin' ? 'Administrador' : 'Lectura'}</div>
                    <button onClick={signOut} className="w-full text-sm text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-600">Cerrar sesión</button>
                </div>
            )}

            {panel && isAdmin && (
                <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setPanel(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mt-12 p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-baseline justify-between mb-1">
                            <h2 className="text-xl font-serif text-primary">Usuarios del dashboard</h2>
                            <button onClick={() => setPanel(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Aprueba a quien deba entrar. Puedes revocar el acceso en cualquier momento.</p>
                        {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-3 text-sm">{err}</div>}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[10.5px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                        <th className="text-left font-semibold py-2">Usuario</th>
                                        <th className="text-left font-semibold py-2 px-2">Estado</th>
                                        <th className="text-left font-semibold py-2 px-2">Rol</th>
                                        <th className="text-right font-semibold py-2">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.user_id} className="border-b border-gray-50">
                                            <td className="py-2">
                                                <div className="flex items-center gap-2">
                                                    {u.avatar_url
                                                        ? <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                                                        : <span className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-xs font-semibold flex items-center justify-center">{(u.full_name || u.email || '?').charAt(0).toUpperCase()}</span>}
                                                    <div>
                                                        <div className="font-medium text-gray-800">{u.full_name || '—'}</div>
                                                        <div className="text-[11px] text-gray-400">{u.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-2 px-2">
                                                <span className={clsx('text-[11px] font-semibold rounded-full px-2 py-0.5',
                                                    u.status === 'approved' ? 'bg-green-50 text-green-700'
                                                        : u.status === 'pending' ? 'bg-amber-50 text-amber-700'
                                                            : 'bg-gray-100 text-gray-500')}>
                                                    {u.status === 'approved' ? 'Aprobado' : u.status === 'pending' ? 'Pendiente' : 'Revocado'}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2 text-gray-500 text-xs">{u.role === 'admin' ? 'Admin' : 'Lectura'}</td>
                                            <td className="py-2 text-right whitespace-nowrap">
                                                {u.status !== 'approved' && (
                                                    <button disabled={busy === u.user_id} onClick={() => decide(u.user_id, 'approved')}
                                                        className="text-xs font-semibold px-3 py-1 rounded-full bg-primary text-white hover:opacity-90 disabled:opacity-50">Aprobar</button>
                                                )}
                                                {u.status === 'approved' && (
                                                    <button disabled={busy === u.user_id} onClick={() => decide(u.user_id, 'revoked')}
                                                        className="text-xs font-semibold px-3 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50">Revocar</button>
                                                )}
                                                {u.status === 'approved' && u.role !== 'admin' && (
                                                    <button disabled={busy === u.user_id} onClick={() => decide(u.user_id, 'approved', 'admin')}
                                                        className="ml-2 text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-accent hover:text-accent disabled:opacity-50">Hacer admin</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {!users.length && <tr><td colSpan={4} className="text-center text-gray-400 italic py-8">Aún no hay usuarios registrados.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserMenu;
