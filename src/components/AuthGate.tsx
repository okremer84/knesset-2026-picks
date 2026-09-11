import React, { createContext, useContext, useEffect, useState } from 'react';
import { clearCsrf, apiFetch, request } from '../lib/api';
type User = { id: number; name: string; email: string };
const AuthContext = createContext<User | null>(null);
export function useUser() { return useContext(AuthContext)!; }
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password' | 'reset-password'>(
    window.location.pathname.startsWith('/reset-password/') ? 'reset-password' : 'login');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiFetch('/api/auth/user').then(async res => {
      if (res.ok) setUser((await res.json()).user);
      else if (res.status !== 401) throw new Error('לא ניתן לטעון את החשבון');
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice(''); setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (mode === 'reset-password') data.token = window.location.pathname.split('/').pop()!;
    try {
      const result = await request<{ user?: User; message?: string }>('/api/auth/' + mode, data);
      clearCsrf();
      if (result.user) setUser(result.user);
      else {
        setNotice(result.message || 'הבקשה התקבלה');
        if (mode === 'reset-password') { setUser(null); window.history.replaceState({}, '', '/'); setMode('login'); }
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function logout() {
    try { await request('/api/auth/logout', {}); clearCsrf(); setUser(null); setMode('login'); }
    catch (e) { setError((e as Error).message); }
  }
  if (loading) return <p dir="rtl" className="p-12 text-center">טוען את החשבון…</p>;
  if (user && mode !== 'reset-password') return <AuthContext.Provider value={user}>
    <div dir="rtl" className="bg-slate-950 text-white px-6 py-2 flex justify-between text-sm">
      <span>שלום, {user.name}</span><button onClick={logout} className="underline">התנתקות</button>
      {error && <span role="alert">{error}</span>}
    </div>
    <React.Fragment key={user.id}>{children}</React.Fragment>
  </AuthContext.Provider>;
  const titles = { login: 'כניסה לפנטזי בחירות', register: 'יצירת חשבון', 'forgot-password': 'איפוס סיסמה', 'reset-password': 'בחירת סיסמה חדשה' };
  const field = 'w-full p-3 border border-slate-300 rounded-xl bg-white';
  return <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-5">
      <div className="text-red-600 text-4xl font-black">120</div>
      <h1 className="text-2xl font-black">{titles[mode]}</h1>
      <p className="text-slate-600 text-sm">התחזיות שלך נשמרות בחשבון האישי. תחזיות החברים נחשפות לאחר נעילת הליגה.</p>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'register' && <label className="block">שם לתצוגה<input name="name" autoComplete="nickname" required maxLength={80} className={field}/></label>}
        <label className="block">אימייל<input name="email" type="email" autoComplete="email" dir="ltr" required defaultValue={new URLSearchParams(window.location.search).get('email') || ''} className={field}/></label>
        {mode !== 'forgot-password' && <label className="block">סיסמה<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 12} className={field}/></label>}
        {(mode === 'register' || mode === 'reset-password') && <label className="block">אימות סיסמה (לפחות 12 תווים)<input name="password_confirmation" type="password" autoComplete="new-password" required minLength={12} className={field}/></label>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {notice && <p role="status" className="text-emerald-700">{notice}</p>}
        <button disabled={busy} className="w-full bg-red-600 text-white rounded-xl p-3 font-bold disabled:opacity-50">{busy ? 'רגע…' : titles[mode]}</button>
      </form>
      <div className="flex gap-4 text-sm">
        {(['login','register','forgot-password'] as const).filter(m => m !== mode).map(m => <button key={m} className="underline" onClick={() => { setMode(m); setError(''); setNotice(''); }}>{titles[m]}</button>)}
      </div>
    </div>
  </main>;
}
