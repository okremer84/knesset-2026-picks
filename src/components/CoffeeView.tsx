import React, { useEffect, useState } from 'react';
import { Coffee, ArrowLeft } from 'lucide-react';
import { request } from '../lib/api';
import { Dialog } from './Dialog';
import { CoffeeDebts } from './CoffeeDebts';

type Person = { id: number; name: string };
export type CoffeeBet = {
  id: number; question: string; terms: string; creator: Person; opponent: Person | null;
  creatorSide: boolean; status: 'waiting' | 'active' | 'pending' | 'disputed' | 'settled' | 'cancelled';
  proposerId: number | null; proposedOutcome: boolean | null; outcome: boolean | null;
  votingEndsAt: string | null; yesVotes: number; noVotes: number; myVote: boolean | null;
};
const sideLabel = (side: boolean) => side ? 'כן' : 'לא';
export const wonBet = (bet: CoffeeBet, userId: number) => bet.status === 'settled' && (bet.outcome === bet.creatorSide ? bet.creator.id : bet.opponent?.id) === userId;
const unresolved = (bet: CoffeeBet) => !['settled', 'cancelled'].includes(bet.status);
export function coffeeStandings(bets: CoffeeBet[]) {
  const people = new Map<number, Person>();
  bets.filter(b => b.status !== 'cancelled').forEach(b => { people.set(b.creator.id, b.creator); if (b.opponent) people.set(b.opponent.id, b.opponent); });
  return [...people.values()].map(person => ({ ...person,
    wins: bets.filter(b => wonBet(b, person.id)).length,
    losses: bets.filter(b => b.status === 'settled' && (b.creator.id === person.id || b.opponent?.id === person.id) && !wonBet(b, person.id)).length,
    open: bets.filter(b => unresolved(b) && (b.creator.id === person.id || b.opponent?.id === person.id)).length,
  })).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name, 'he'));
}
const statuses: Record<CoffeeBet['status'], string> = { waiting: 'פתוח', active: 'הקפה על השולחן', pending: 'מחכה להסכמה', disputed: 'הקהל מחליט', settled: 'הוכרעה', cancelled: 'בוטלה' };

export function CoffeeView({ userId }: { userId: number }) {
  const [bets, setBets] = useState<CoffeeBet[]>([]);
  const [tab, setTab] = useState<'waiting' | 'open' | 'leaderboard'>('waiting');
  const [betScope, setBetScope] = useState<'all' | 'mine'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [terms, setTerms] = useState('');
  const [side, setSide] = useState(true);
  const [selected, setSelected] = useState<Person | null>(null);
  const [profileTab, setProfileTab] = useState<'open' | 'won' | 'lost'>('open');
  const [confirm, setConfirm] = useState<{ bet: CoffeeBet; action: string; outcome?: boolean } | null>(null);
  const refresh = async () => { const data = await request<{ bets: CoffeeBet[] }>('/api/coffee'); setBets(data.bets); };
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const data = await request<{ bets: CoffeeBet[] }>('/api/coffee'); if (alive) { setBets(data.bets); setError(''); } }
      catch (e) { if (alive) setError(e instanceof Error ? e.message : 'לא ניתן לטעון התערבויות'); }
      finally { if (alive) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(load, 30000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [userId]);
  const mutate = async (url: string, data: unknown, done: () => void) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await request(url, data); done(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  };
  const selectPerson = (person: Person) => { setSelected(person); setProfileTab('open'); };
  const personButton = (person: Person) => <button className="coffee-person" onClick={() => selectPerson(person)}>{person.name}</button>;
  const action = (bet: CoffeeBet, name: string, outcome?: boolean) => setConfirm({ bet, action: name, outcome });
  const card = (bet: CoffeeBet) => {
    const participant = bet.creator.id === userId || bet.opponent?.id === userId;
    const ended = !!bet.votingEndsAt && Date.now() >= Date.parse(bet.votingEndsAt);
    const winner = bet.outcome === bet.creatorSide ? bet.creator : bet.opponent;
    const loser = bet.outcome === bet.creatorSide ? bet.opponent : bet.creator;
    return <article className={`coffee-card coffee-card--${bet.creatorSide ? 'yes' : 'no'}`} key={bet.id}>
      {bet.status !== 'settled' && <div className="coffee-card-can" aria-hidden="true"><img src="/images/master-coffee-latte.png" alt="" width={600} height={600}/></div>}
      {!['waiting', 'active'].includes(bet.status) && <div className="coffee-card-top"><span className={`coffee-status ${bet.status}`}>{statuses[bet.status]}</span></div>}
      <h3>{bet.question}</h3>
      {bet.status === 'waiting' && <div className="coffee-opened-by">{bet.creator.id === userId ? <>אתה בחרת ״{sideLabel(bet.creatorSide)}״<br/>מחכים למישהו שיהמר על ״{sideLabel(!bet.creatorSide)}״</> : <>{personButton(bet.creator)} בחר ״{sideLabel(bet.creatorSide)}״, רוצה לשים מאסטרקפה ש{sideLabel(!bet.creatorSide)}?</>}</div>}
      {bet.terms && <div className="coffee-card-rules"><p className="coffee-terms" title={bet.terms}>{bet.terms}</p></div>}
      {bet.opponent && bet.status !== 'settled' && <div className="coffee-match"><div>{personButton(bet.creator)}<span className={bet.creatorSide ? 'yes' : 'no'}>{sideLabel(bet.creatorSide)}</span></div><span className="coffee-vs">מול</span><div>{personButton(bet.opponent)}<span className={!bet.creatorSide ? 'yes' : 'no'}>{sideLabel(!bet.creatorSide)}</span></div></div>}
      {bet.status === 'waiting' && <div className="coffee-actions">{participant ? <button disabled={busy} onClick={() => action(bet, 'cancel')}>ביטול ההתערבות</button> : <button className="coffee-primary coffee-join" disabled={busy} onClick={() => action(bet, 'join')}>שם מאסטרקפה ש{sideLabel(!bet.creatorSide)} <ArrowLeft size={16}/></button>}</div>}
      {bet.status === 'active' && participant && <div className="coffee-actions coffee-outcome-actions"><span>יש תוצאה?</span><button disabled={busy} onClick={() => action(bet, 'propose', true)}>התשובה כן</button><button disabled={busy} onClick={() => action(bet, 'propose', false)}>התשובה לא</button></div>}
      {bet.status === 'pending' && <div className="coffee-resolution"><p>{bet.proposerId === bet.creator.id ? bet.creator.name : bet.opponent?.name} הציעו: התשובה <strong>{sideLabel(bet.proposedOutcome!)}</strong>.</p>{participant && bet.proposerId !== userId ? <div className="coffee-actions"><button className="coffee-primary" disabled={busy} onClick={() => action(bet, 'agree')}>מסכימים, סוגרים</button><button disabled={busy} onClick={() => action(bet, 'dispute')}>לא מסכימים — לקהל</button></div> : <p>ממתינים להסכמת הצד השני.</p>}</div>}
      {bet.status === 'disputed' && <div className="coffee-resolution"><p>{ended ? 'תיקו בתום 48 שעות — הקול הבא יכריע.' : `ההצבעה נסגרת ב־${new Date(bet.votingEndsAt!).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })} (שעון ישראל)`}</p><div className="coffee-vote-count"><span>כן · {bet.yesVotes}</span><span>לא · {bet.noVotes}</span></div>{bet.myVote !== null ? <p>הצבעתם: {sideLabel(bet.myVote)}</p> : participant ? <p>הקהל מכריע. משתתפי ההתערבות לא מצביעים.</p> : <div className="coffee-actions"><button disabled={busy} onClick={() => action(bet, 'vote', true)}>מצביעים כן</button><button disabled={busy} onClick={() => action(bet, 'vote', false)}>מצביעים לא</button></div>}</div>}
      {bet.status === 'settled' && winner && loser && <div className="coffee-result"><div className="coffee-winner"><img className="coffee-winner-can" src="/images/master-coffee-latte.png" alt="" width={600} height={600}/><span>{winner.name} זכה במאסטרקפה</span><img className="coffee-winner-can" src="/images/master-coffee-latte.png" alt="" width={600} height={600}/></div><p>{loser.name} חייב לו מאסטרקפה</p></div>}
    </article>;
  };
  const visible = selected ? bets.filter(b => (b.creator.id === selected.id || b.opponent?.id === selected.id) && (profileTab === 'open' ? unresolved(b) : b.status === 'settled' && (profileTab === 'won' ? wonBet(b, selected.id) : !wonBet(b, selected.id)))) : bets.filter(b => tab === 'waiting' ? b.status === 'waiting' : unresolved(b) && (betScope === 'all' || b.creator.id === userId || b.opponent?.id === userId));
  const confirmationText = confirm && ({ join: `מצטרפים לצד ה״${sideLabel(!confirm.bet.creatorSide)}״. המפסיד חייב למנצח מאסטרקפה אחד.`, cancel: 'ההתערבות תוסר מהלוח. אפשר לבטל רק כל עוד אין יריב.', propose: `הצעת הכרעה: התשובה ${sideLabel(!!confirm.outcome)}. הצד השני יצטרך להסכים.`, agree: `ההתערבות תיסגר עם התשובה ${sideLabel(!!confirm.bet.proposedOutcome)} והניצחון יירשם בטבלה.`, dispute: 'תיפתח הצבעה לקהל למשך 48 שעות. הרוב מכריע; בתיקו מחכים לקול שובר שוויון.', vote: `ההצבעה שלכם: ${sideLabel(!!confirm.outcome)}. לכל אדם קול אחד, ואי אפשר לשנות אותו.` }[confirm.action]);
  return <section className="coffee-page" dir="rtl">
    <div className="coffee-hero"><div><h1>מאסטרקפה<span>?</span></h1><span className="coffee-hero-caption">על ״קפה״.</span></div><div className="coffee-hero-mark"><img src="/images/master-coffee-latte.png" alt="פחית מאסטר קפה לאטה" width={600} height={600}/></div></div>
    <div className="coffee-toolbar"><button className="coffee-primary" onClick={() => { setError(''); setCreating(true); }}>התערבות חדשה</button></div>
    <nav className="coffee-tabs" aria-label="מאסטרקפה"><button aria-current={!selected && tab === 'waiting' ? 'page' : undefined} onClick={() => { setSelected(null); setTab('waiting'); }}>מחכות למהמר <span>{bets.filter(b => b.status === 'waiting').length}</span></button><button aria-current={!selected && tab === 'open' ? 'page' : undefined} onClick={() => { setSelected(null); setTab('open'); }}>התערבויות <span>{bets.filter(unresolved).length}</span></button><button aria-current={!selected && tab === 'leaderboard' ? 'page' : undefined} onClick={() => { setSelected(null); setTab('leaderboard'); }}>טבלה</button></nav>
    {!selected && tab === 'open' && <div className="coffee-scope" role="group" aria-label="סינון התערבויות">{([['all', 'כל ההתערבויות'], ['mine', 'ההתערבויות שלי']] as const).map(([scope, label]) => <button key={scope} aria-pressed={betScope === scope} onClick={() => setBetScope(scope)}>{label}</button>)}</div>}
    {error && !creating && !confirm && <p role="alert" className="coffee-error">{error} <button onClick={() => void refresh().then(() => setError('')).catch(e => setError(e.message))}>ניסיון נוסף</button></p>}
    {loading ? <p role="status" className="coffee-empty">טוענים את ההתערבויות…</p> : selected ? <><div className="coffee-profile"><h2>ההתערבויות של {selected.name}</h2><button onClick={() => setSelected(null)}>חזרה ללוח ←</button></div><nav className="coffee-tabs" aria-label="סינון התערבויות של שחקן">{([['open', 'פתוחות'], ['won', 'ניצחונות'], ['lost', 'הפסדים']] as const).map(([id, label]) => <button key={id} aria-current={profileTab === id ? 'page' : undefined} onClick={() => setProfileTab(id)}>{label}</button>)}</nav><div className="coffee-grid">{visible.map(card)}</div>{!visible.length && <p className="coffee-empty">אין עדיין התערבויות בקטגוריה הזו.</p>}</> : tab === 'leaderboard' ? <CoffeeDebts bets={bets} userId={userId}/> : <><div className="coffee-grid">{visible.map(card)}</div>{!visible.length && <div className="coffee-empty"><Coffee size={32}/><h2>{tab === 'waiting' ? 'מי שם את הקפה הראשון?' : 'אין התערבויות פתוחות כרגע'}</h2><p>שאלה טובה, שני צדדים ומאסטרקפה אחד.</p><button className="coffee-primary" onClick={() => setCreating(true)}>פותחים התערבות</button></div>}</>}
    {creating && <Dialog open label="התערבות חדשה" onClose={() => { if (!busy) setCreating(false); }} className="coffee-dialog"><form onSubmit={e => { e.preventDefault(); void mutate('/api/coffee', { question, terms, side }, () => { setCreating(false); setQuestion(''); setTerms(''); setSelected(null); setTab('waiting'); }); }}><div className="coffee-dialog-title"><h2>על מה מתערבים?</h2><button type="button" disabled={busy} onClick={() => setCreating(false)} aria-label="סגירה">✕</button></div><label>שאלה של כן או לא<input required maxLength={240} value={question} onChange={e => setQuestion(e.target.value)} placeholder="ביבי יהיה ראש הממשלה הבא?"/></label><label>כללים (לא חובה)<textarea maxLength={2000} rows={3} value={terms} onChange={e => setTerms(e.target.value)} placeholder="למשל: לפי זהות ראש הממשלה במועד השבעת הממשלה הבאה."/></label><fieldset><legend>הצד שלי</legend><label><input type="radio" name="side" checked={side} onChange={() => setSide(true)}/> כן</label><label><input type="radio" name="side" checked={!side} onChange={() => setSide(false)}/> לא</label></fieldset><p>על מאסטרקפה.<br/>הכרעה דורשת הסכמה של שניכם או הצבעת קהל של 48 שעות.</p>{error && <p role="alert" className="coffee-error">{error}</p>}<button className="coffee-primary" disabled={busy || !question.trim()}>{busy ? 'שומרים…' : 'פתח התערבות'}</button></form></Dialog>}
    {confirm && <Dialog open label="אישור פעולה" onClose={() => { if (!busy) setConfirm(null); }} className="coffee-dialog"><h2>{confirm.bet.question}</h2>{confirm.bet.terms && <p className="coffee-terms">{confirm.bet.terms}</p>}<p>{confirmationText}</p>{error && <p role="alert" className="coffee-error">{error}</p>}<div className="coffee-actions"><button className="coffee-primary" disabled={busy} onClick={() => void mutate(`/api/coffee/${confirm.bet.id}`, { action: confirm.action, ...(confirm.outcome !== undefined ? { outcome: confirm.outcome } : {}) }, () => setConfirm(null))}>{busy ? 'שומרים…' : 'אישור'}</button><button disabled={busy} onClick={() => setConfirm(null)}>חזרה</button></div></Dialog>}
  </section>;
}
