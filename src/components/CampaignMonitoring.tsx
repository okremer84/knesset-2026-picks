import React, { useCallback, useEffect, useRef, useState } from 'react';
import { money } from '../lib/campaign';
import { israelInstant } from '../utils/israelTime';
import type { CampaignAction } from './CampaignView';

type Item = { id: number; url: string; title: string; text: string; published_at: string; dismissed: boolean; dismissal?: string; duplicate_of?: string; matches?: string[]; metadata: { readable?: boolean; original_captured?: boolean; error?: string } };
type Packet = { market_id: string; title: string; mode: string; status: string; message: string; version: string; observed?: number; items: Item[]; baseline: Item[]; coverage: { id: number; name: string; complete: boolean; message: string }[] };
type MonitoringData = { x_configured: boolean; sources: { id: number; kind: string; name: string; items: number; last_run: null | { status: string; finished_at: string; message?: string } }[]; packets: Packet[] };
type Preview = { token: string; outcome: string; payout: number; refund: number };
export function CampaignMonitoring({ onAction, onDone }: { onAction: CampaignAction; onDone: () => void }) {
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const [data, setData] = useState<MonitoringData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ market: string; version: string; result: Preview } | null>(null);
  const refresh = useCallback(async () => {
    const next = await actionRef.current<MonitoringData>('/monitoring');
    setData(next);
    setPreview(old => old && next.packets.some(p => p.market_id === old.market && p.version === old.version) ? old : null);
  }, []);
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, [refresh]);
  async function run(path: string, body: unknown) {
    setBusy(true); setError('');
    try { await onAction(path, body); setPreview(null); await refresh(); onDone(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function prepare(p: Packet, item?: Item) {
    setBusy(true); setError(''); setPreview(null);
    try { const result = await onAction<Preview>(`/markets/${p.market_id}/monitor-preview`, { version: p.version, observation_id: item?.id, direct_and_new: !!item }); setPreview({ market: p.market_id, version: p.version, result }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="campaign-form campaign-monitoring">
    <h3>מעקב ואישור ראיות</h3><p>המערכת אוספת, אתם מכריעים. כסף משולם רק לאחר אישור ההכרעה.</p>
    {error && <p role="alert" className="campaign-error">{error}</p>}
    <button disabled={busy} onClick={() => void refresh().then(() => setError('')).catch(e => setError(e.message))}>רענון מצב המעקב</button>
    {data && <>
      {!data.x_configured && <p role="status">X עדיין לא מחובר. נדרשת גישת API לקריאת פוסטים ומפתח שמוגדר בסוד בשרת. אפשר להכין טיוטות; פרסום הימורי X חסום עד לאיסוף תקין.</p>}
      <details><summary>מצב המקורות והגדרות האיסוף</summary>
      <button disabled={busy} onClick={() => void run('/monitoring/setup', {})}>הגדרת מקורות והתחלת איסוף</button>
      <p className="campaign-muted">חדשות: הזנות ynet, N12 וגלובס בלבד; כתבות עם אוריך בכותרת או בתקציר. אין כאן כיסוי של כל כתבה באתר. האיסוף המתוזמן דורש שרת עם תור משימות ומתזמן פעילים.</p>
      {data.sources.map(s => <article key={s.id} className="monitor-card"><strong>{s.name}</strong><p>{s.items} פריטים בארכיון · {s.last_run ? s.last_run.status === 'ok' ? 'בדיקה אחרונה תקינה' : 'האיסוף נכשל' : 'טרם נאסף'}</p>{s.last_run && <small dir="auto">{s.last_run.finished_at} UTC · {s.last_run.message}</small>}<button disabled={busy || (s.kind === 'x' && !data.x_configured)} onClick={() => void run(`/monitoring/sources/${s.id}/collect`, {})}>איסוף עכשיו</button></article>)}
      </details>
      <details><summary>הכנת שאלות מהמקורות</summary><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run('/monitoring/drafts', { kind: f.get('kind'), starts_at: israelInstant(String(f.get('starts_at'))), ends_at: israelInstant(String(f.get('ends_at'))) }); }}><fieldset disabled={busy}><label>סוג<select name="kind"><option value="news">פרסומי אוריך</option><option value="x">פעילות ופוסט הבא ב־X</option></select></label><label>תחילת החלון · שעון ישראל<input type="datetime-local" name="starts_at" required/></label><label>סוף החלון · שעון ישראל<input type="datetime-local" name="ends_at" required/></label><p>ההימורים נסגרים בתחילת החלון. השאלות ימתינו לעריכה ופרסום בתיבת הרעיונות.</p><button>יצירת טיוטות</button></fieldset></form></details>
      {!data.packets.length && <p>אין שאלות מנוטרות שפורסמו וממתינות להכרעה.</p>}
      {data.packets.map(p => <article className="monitor-card" key={p.market_id}><h3>{p.title}</h3><p>{p.message}</p><details><summary>כיסוי המקורות</summary>{p.coverage.map(c => <p key={c.id}>{c.name}: {c.message}</p>)}</details>
        {!!p.baseline.length && <details><summary>פרסומים קודמים להשוואה ({p.baseline.length})</summary><p>זהו הארכיון שנאסף, ולא היסטוריה מלאה של כל הפרסומים.</p>{p.baseline.map(i => <EvidenceItem key={i.id} item={i}/>)}</details>}
        {p.mode === 'news_reporting' && !p.baseline.length && <p>אין בארכיון פרסום קודם על האדם הזה. יש לבדוק חידוש מול פרסומים קודמים לפני אישור „כן”.</p>}
        {p.items.map(i => <div key={i.id}><EvidenceItem item={i}/>{p.mode === 'news_reporting' && !i.dismissed && <><form onSubmit={e => { e.preventDefault(); void prepare(p, i); }}><fieldset disabled={busy || !i.metadata.readable || !!i.duplicate_of}><label><input type="checkbox" required/> בדקתי: זו התכתבות ישירה בעניין ציבורי עם תוכן חדש ביחס לפרסומים הקודמים</label><button>בדיקת תשלום „כן”</button></fieldset></form><form onSubmit={e => { e.preventDefault(); void run(`/markets/${p.market_id}/monitor-dismiss`, { version: p.version, observation_id: i.id, reason: new FormData(e.currentTarget).get('reason') }); }}><label>מדוע הכתבה אינה עומדת בתנאים?<input name="reason" required maxLength={300}/></label><button disabled={busy || !i.metadata.readable}>סימון כלא מתאימה</button></form></>}</div>)}
        {p.status === 'ready' && <button disabled={busy} onClick={() => void prepare(p)}>בדיקת תשלום לפי הראיות · ערך {p.observed}</button>}
        {preview?.market === p.market_id && <div className="settlement-preview"><strong>התוצאה: {preview.result.outcome === 'yes' ? 'כן' : 'לא'}</strong><p>זכיות: {money(preview.result.payout)} · החזרים: {money(preview.result.refund)}</p><button disabled={busy} onClick={() => void run(`/markets/${p.market_id}/settle`, { token: preview.result.token })}>אישור ההכרעה והתשלום</button></div>}
        {['void', 'incomplete', 'review'].includes(p.status) && <details><summary>ביטול והחזר כאשר אין אפשרות להכריע</summary><form onSubmit={e => { e.preventDefault(); void run(`/markets/${p.market_id}/void`, { reason: new FormData(e.currentTarget).get('reason') }); }}><label>סיבה גלויה לחברים<input name="reason" required/></label><button disabled={busy}>ביטול השוק והחזרת כל ההימורים</button></form></details>}
      </article>)}
    </>}
  </div>;
}
function EvidenceItem({ item: i }: { item: Item }) {
  return <div className="monitor-evidence"><a href={i.url} target="_blank" rel="noreferrer">{i.title}</a><p>{i.published_at}{i.matches?.length ? ` · התאמות: ${i.matches.join(', ')}` : ''}</p>{i.metadata.error && <p className="campaign-error">{i.metadata.error}</p>}{i.dismissed && <p>נבדק ולא מתאים: {i.dismissal}</p>}{i.duplicate_of && <p>הטקסט זהה לפרסום קודם בארכיון.</p>}<details><summary>הטקסט שנאסף</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{i.text}</p></details></div>;
}
