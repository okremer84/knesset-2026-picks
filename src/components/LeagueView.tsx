import { DeadlineInput } from './DeadlineInput';
import React, { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { Share2, Settings, ChevronDown, X, Plus } from 'lucide-react';
import { League, Prediction, Survey, ElectionStage } from '../types';
import { calculateScore } from '../utils/scoring';
import { PARTIES_LIST } from '../data/parties';
import { formatIsraelTime, israelInstant, israelLocalTime } from '../utils/israelTime';
import { request } from '../lib/api';
interface LeagueViewProps {
  league: League; allSurveys: Survey[]; selectedSurveyId: string;
  onSelectSurveyId: (id: string) => void; onOpenCreateLeague: () => void;
  onJoinExistingLeagueById: (code: string) => void; onNavigateToPicker: () => void;
  userPrediction?: Prediction; currentUserName?: string; currentUserId?: number;
  onLeagueUpdate?: (league: League) => void;
}

export function PickDetails({ prediction, benchmark }: { prediction: Prediction; benchmark: Survey | null }) {
  const scale = Math.max(1, ...Object.values(prediction.seats), ...Object.values(benchmark?.seats || {}));
  return <div className="league-pick-details">
    <p>הוגש: {formatIsraelTime(prediction.submittedAt)} · שעון ישראל</p>
    <p className="pick-legend"><span>תחזית</span><span>מקור ההשוואה</span></p>
    <table><caption className="sr-only">פירוט התחזית של {prediction.memberName}</caption><thead><tr><th>מפלגה</th><th>תחזית</th><th>מקור</th><th>הפרש</th><th>השוואה</th></tr></thead><tbody>
      {PARTIES_LIST.map(party => {
        const predicted = prediction.seats[party.id] || 0;
        const actual = benchmark?.seats[party.id];
        return <tr key={party.id}><th scope="row">{party.name}</th><td>{predicted}</td><td>{actual ?? 'לא דווח'}</td><td>{actual === undefined ? '—' : Math.abs(predicted - actual)}</td><td><div className="pick-bars" aria-hidden="true"><span style={{ width: `${predicted / scale * 100}%` }}/>{actual !== undefined && <span style={{ width: `${actual / scale * 100}%` }}/>}</div></td></tr>;
      })}
    </tbody></table>
  </div>;
}

export function LeagueView({ league, allSurveys, onOpenCreateLeague, onNavigateToPicker, onLeagueUpdate, userPrediction, currentUserId }: LeagueViewProps) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  const [deadline, setDeadline] = useState(israelLocalTime(league.locksAt));
  const [inspect, setInspect] = useState<string | null>(null);
  useEffect(() => { if (!settingsOpen) {
    setDeadline(israelLocalTime(league.locksAt));
  } }, [settingsOpen, league.locksAt, league.electionStage, league.targetSurveyId, league.benchmarkTurnoutPercentage]);
  const benchmark = ['exit_poll', 'official_results'].includes(league.benchmarkSurvey?.kind || '') ? league.benchmarkSurvey : null;
  const hidden = league.predictionsHidden;

  // Compatibility for older cached league responses; the server supplies the complete roster.
  const roster = league.participants ?? [
    ...league.members.map(p => ({ userId: p.userId, name: p.memberName, submitted: true })),
    ...(league.unsubmittedPlayers || []).map(p => ({ userId: Number(p.id), name: p.name, submitted: false })),
  ];
  const ranks = [...(benchmark ? league.rankings : [])].sort((a, b) => a.error - b.error || (a.turnoutDiff ?? 0) - (b.turnoutDiff ?? 0));
  const rows = roster.map(person => {
    const prediction = league.members.find(p => p.userId === person.userId);
    const rank = ranks.find(r => r.predictionId === prediction?.id);
    const position = rank ? ranks.findIndex(r => r.error === rank.error && r.turnoutDiff === rank.turnoutDiff) + 1 : null;
    return { person, prediction, rank, position };
  }).sort((a, b) => hidden ? a.person.name.localeCompare(b.person.name, 'he') : (a.position ?? Infinity) - (b.position ?? Infinity) || a.person.name.localeCompare(b.person.name, 'he'));
  function highlight(prediction: Prediction | undefined, best: boolean) {
    if (!prediction || !benchmark) return '—';
    const picks = calculateScore(prediction.seats, benchmark.seats).partyBreakdown;
    if (!picks.length) return '—';
    const diff = (best ? Math.min : Math.max)(...picks.map(p => p.diff));
    if (!best && diff === 0) return 'אין פערים';
    const tied = picks.filter(p => p.diff === diff);
    return <><span>{tied[0].partyName}{tied.length > 1 ? ` ועוד ${tied.length - 1}` : ''}</span><small>{diff === 0 ? 'בול' : `פער של ${diff}`}</small></>;
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.origin + '/?invite=' + league.inviteCode); setNotice('קישור ההזמנה הועתק'); }
    catch { setError('לא ניתן להעתיק. קוד ההזמנה: ' + league.inviteCode); }
  }
  async function update(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setSettingsError(''); setNotice('');
    try {
      const result = await request<{ league: League }>(`/api/leagues/${league.id}/deadline`, { locksAt: israelInstant(deadline.split('T')[0] + 'T20:00') });
      onLeagueUpdate?.(result.league); setSettingsOpen(false); setNotice('מועד ההגשה עודכן');
    } catch (e) { setSettingsError((e as Error).message); } finally { setBusy(false); }
  }
  return <div dir="rtl" className="league-page">
    <header className="league-header"><div><p className="eyebrow">הליגות שלי</p><h1>{league.name}</h1><p>{league.submittedCount} מתוך {league.totalPlayersCount} הגישו · {league.isLocked ? 'ההגשה נסגרה' : 'הגשה עד'} {formatIsraelTime(league.locksAt)} · שעון ישראל</p></div>
    </header>
    <div className="league-action-bar" role="group" aria-label="פעולות ליגה">
      <button className="button-quiet" onClick={share}><Share2 size={16}/>שיתוף</button>
      <button className="button-quiet" onClick={onOpenCreateLeague}><Plus size={16}/>יצירת ליגה חדשה</button>
      {league.isCommissioner && <button className="button-quiet" onClick={() => { setSettingsError(''); setSettingsOpen(true); }}><Settings size={16}/>הגדרות</button>}
    </div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="league-table-caption">{hidden ? <p>התחזיות וההערות ייחשפו בתאריך האחרון להגשה, בשעה 20:00 בשעון ישראל.</p> : <><p>{benchmark?.kind === 'official_results' ? 'תוצאות סופיות' : benchmark ? 'מדגם · דירוג זמני' : 'ממתינים לפרסום המדגם · הניקוד יופיע לאחר הפרסום'}</p><details><summary>איך הניקוד עובד?</summary><p>פחות נקודות עדיף: סכום ההפרשים המוחלטים במנדטים. בשוויון, התחזית הקרובה יותר לאחוז ההצבעה הרשמי מנצחת. עד פרסום אחוז ההצבעה, או כשהפער זהה, המקום משותף. מפלגות שלא דווחו אינן נכללות בניקוד.</p>{benchmark?.sourceUrl && <a href={benchmark.sourceUrl} target="_blank" rel="noreferrer">מקור הנתונים</a>}</details></>}</div>
    <div className="league-table-scroll"><table className={`league-table ${hidden ? 'before-reveal' : ''}`}>
      <caption className="sr-only">משתתפי {league.name}</caption>
      <thead><tr>{(hidden ? ['שם', 'תחזית'] : ['מקום', 'שם', 'נקודות ↓', 'אחוז הצבעה', 'הכי קרוב', 'הכי רחוק', 'הערה', '']).map((title, i) => <th key={i} scope="col">{title || <span className="sr-only">פעולות</span>}</th>)}</tr></thead>
      <tbody>{rows.map(({ person, prediction, rank, position }) => {
        const mine = (currentUserId ?? userPrediction?.userId) === person.userId;
        const expanded = !!prediction && inspect === prediction.id;
        return <React.Fragment key={person.userId}><tr className={mine ? 'my-league-row' : ''}>
          {!hidden && <td>{position ?? '—'}</td>}
          <th scope="row">{prediction?.pickName ? <><strong>{prediction.pickName}</strong><small>{person.name}</small></> : person.name}</th>
          {hidden ? <td>{mine && !league.isLocked && !league.myPickLocked
            ? <button className="text-action" onClick={onNavigateToPicker}>{person.submitted ? 'הוגשה · עדכון' : 'הגשת תחזית'}</button>
            : <span className={`submission-state ${person.submitted ? 'submitted' : ''}`}>{person.submitted ? 'הוגשה' : 'טרם הוגשה'}</span>}
          </td> : <>
            <td className="league-score">{rank?.error ?? '—'}</td>
            <td>{prediction?.turnoutPercentage == null ? '—' : `${prediction.turnoutPercentage}%`}{rank?.turnoutDiff != null && <small>פער {rank.turnoutDiff.toFixed(1)} נק׳ אחוז</small>}</td>
            <td>{highlight(prediction, true)}</td><td>{highlight(prediction, false)}</td>
            <td className="league-note">{prediction?.note || '—'}</td>
            <td>{prediction ? <button className="text-action expand-pick" aria-label={`התחזית של ${person.name}`} aria-expanded={expanded} aria-controls={`picks-${prediction.id}`} onClick={() => setInspect(expanded ? null : prediction.id)}><span>{expanded ? 'סגירה' : 'תחזית'}</span><ChevronDown size={15}/></button> : <span className="submission-state">לא הוגשה</span>}</td>
          </>}
        </tr>{!hidden && expanded && prediction && <tr id={`picks-${prediction.id}`}><td colSpan={8}><PickDetails prediction={prediction} benchmark={benchmark}/></td></tr>}</React.Fragment>;
      })}</tbody>
    </table></div>
    {!rows.length && <p>עדיין אין משתתפים בליגה.</p>}

    {settingsOpen && league.isCommissioner && <Dialog open closeOnBackdrop onClose={() => { if (!busy) setSettingsOpen(false); }} label="הגדרות הליגה" className="league-settings-dialog">
      <div className="profile-heading"><h2>הגדרות הליגה</h2><button aria-label="סגירה" disabled={busy} onClick={() => setSettingsOpen(false)}><X size={20}/></button></div>
      <p>מנהל הליגה: {league.creatorName}</p>
      {settingsError && <p role="alert">{settingsError}</p>}
      <form onSubmit={update}><h3>מועד אחרון להגשה</h3><DeadlineInput value={deadline} onChange={setDeadline} disabled={busy || league.isLocked} max={league.deadlineLimit}/>
        <p>{league.isLocked ? 'התחזיות נחשפו. לא ניתן לפתוח מחדש את ההגשה.' : league.deadlineLimit ? 'הבחירות יתגלו במועד נעילת התחזיות' : 'מועד הבחירות טרם הוגדר.'}</p>
        {!league.isLocked && <button className="button-primary" disabled={busy || !league.deadlineLimit}>שמירת מועד ההגשה</button>}
      </form>
    </Dialog>}
  </div>;
}
