import React, { createContext, useContext, useEffect, useState } from 'react';
import { clearCsrf, apiFetch, request } from '../lib/api';
type User = { id: number; name: string; email: string };
const AuthContext = createContext<User | null>(null);
export function useUser() { return useContext(AuthContext)!; }

export function GoogleSignIn({ enabled, error, href }: { enabled: boolean; error: string; href: string }) {
  return <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-5">
      <div className="text-red-600 text-4xl font-black">120</div>
      <h1 className="text-2xl font-black">כניסה לפנטזי בחירות</h1>
      <p className="text-slate-600 text-sm">מתחברים עם Google ומתחילים לשחק. התחזיות שלך נשמרות בחשבון האישי.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {enabled
        ? <a href={href} className="flex justify-center w-full border border-slate-300 bg-white text-slate-900 rounded-xl p-3 font-bold hover:bg-slate-50">המשך עם Google</a>
        : <><button disabled className="w-full border border-slate-200 text-slate-400 rounded-xl p-3 font-bold">המשך עם Google</button>
          <p role="status" className="text-slate-600 text-sm">ההתחברות עם Google עדיין לא זמינה. נסו שוב בקרוב.</p></>}
    </div>
  </main>;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [error, setError] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('auth_error');
    if (code === 'account_exists') return 'קיים חשבון עם כתובת האימייל הזו. פנו למנהל האתר כדי לחבר אותו ל-Google.';
    if (code === 'unavailable') return 'ההתחברות עם Google עדיין לא זמינה. נסו שוב בקרוב.';
    return code ? 'ההתחברות לא הושלמה. נסו שוב עם Google.' : '';
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('auth_error')) {
      url.searchParams.delete('auth_error');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    Promise.all([
      apiFetch('/api/auth/user').then(async res => {
        if (res.ok) setUser((await res.json()).user);
        else if (res.status !== 401) throw new Error('לא ניתן לטעון את החשבון');
      }),
      apiFetch('/api/auth/config').then(async res => {
        if (!res.ok) throw new Error('לא ניתן לטעון את אפשרויות ההתחברות');
        setGoogleEnabled((await res.json()).googleEnabled);
      }),
    ]).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  async function logout() {
    try { await request('/api/auth/logout', {}); clearCsrf(); setUser(null); setError(''); }
    catch (e) { setError((e as Error).message); }
  }
  if (loading) return <p dir="rtl" className="p-12 text-center">טוען את החשבון…</p>;
  if (user) return <AuthContext.Provider value={user}>
    <div dir="rtl" className="bg-slate-950 text-white px-6 py-2 flex justify-between text-sm">
      <span>שלום, {user.name}</span><button onClick={logout} className="underline">התנתקות</button>
      {error && <span role="alert">{error}</span>}
    </div>
    <React.Fragment key={user.id}>{children}</React.Fragment>
  </AuthContext.Provider>;
  const params = new URLSearchParams();
  const current = new URLSearchParams(window.location.search);
  for (const key of ['invite', 'league']) {
    const value = current.get(key);
    if (value) params.set(key, value);
  }
  return <GoogleSignIn enabled={googleEnabled} error={error} href={'/auth/google' + (params.size ? '?' + params : '')}/>;
}
