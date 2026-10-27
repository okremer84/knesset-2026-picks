import React, { useState } from 'react';
import { Share2, Plus } from 'lucide-react';
import { League, Prediction, Survey } from '../types';
import { calculateScore } from '../utils/scoring';
import { PARTIES_LIST } from '../data/parties';
import { formatIsraelTime } from '../utils/israelTime';
import { surveyTitle, latestElectionResults, localizeSurvey } from '../utils/surveys';
import { GovernmentBuilder } from './GovernmentBuilder';
import { Avatar } from './ProfileModal';
const REVEAL_PARTIES = PARTIES_LIST.filter(party => party.id !== 'balad');

const blocTotal = (prediction: Prediction, blocs: string[]) => REVEAL_PARTIES
  .filter(party => blocs.includes(party.bloc))
  .reduce((total, party) => total + (prediction.seats[party.id] ?? 0), 0);

interface LeagueViewProps {
  league: League; allSurveys: Survey[]; selectedSurveyId: string;
  onSelectSurveyId: (id: string) => void; onOpenCreateLeague: () => void;
  onJoinExistingLeagueById: (code: string) => void; onNavigateToPicker: () => void;
  userPrediction?: Prediction; currentUserName?: string; currentUserId?: number;
}

export function PickDetails({ prediction, benchmark }: { prediction: Prediction; benchmark: Survey | null }) {
  const scale = Math.max(1, ...Object.values(prediction.seats), ...Object.values(benchmark?.seats || {}));
  return <div className="league-pick-details">
    <div className="pick-detail-heading"><div><h3>{prediction.pickName || prediction.memberName}</h3><p>הוגש: {formatIsraelTime(prediction.submittedAt)} · שעון ישראל</p></div><span>מנדטים · מהגבוה לנמוך</span></div>
    <dl className="pick-majorities">
      {[
        { label: 'אופוזיציה יכולה להקים ממשלה', blocs: ['opposition'] },
        { label: 'אופוזיציה יכולה להקים ממשלה עם המפלגות הערביות', blocs: ['opposition', 'arab'] },
        { label: 'קואליציה יכולה להקים ממשלה', blocs: ['coalition'] },
      ].map(scenario => {
        const seats = blocTotal(prediction, scenario.blocs);
        return <div key={scenario.label}><dt>{scenario.label}</dt><dd><strong>{seats >= 61 ? 'כן' : 'לא'}</strong><span>{seats} מנדטים</span></dd></div>;
      })}
    </dl>
    <p className="pick-majority-note">לפי התחזית · רוב של 61 מנדטים ומעלה</p>
    <p className="pick-legend"><span>תחזית</span>{benchmark && <span>{surveyTitle(benchmark)}</span>}</p>
    <table><caption className="sr-only">פירוט התחזית של {prediction.memberName}</caption><thead><tr><th>מפלגה</th><th>תחזית</th><th>מקור</th><th>הפרש</th><th>השוואה</th></tr></thead><tbody>
      {[...REVEAL_PARTIES].sort((a, b) => (prediction.seats[b.id] || 0) - (prediction.seats[a.id] || 0) || a.name.localeCompare(b.name, 'he')).map(party => {
        const predicted = prediction.seats[party.id] || 0;
        const actual = benchmark?.seats[party.id];
        return <tr key={party.id}><th scope="row"><span className="pick-party-dot" style={{ background: party.color }}/>{party.name}</th><td>{predicted}</td><td>{actual ?? 'לא דווח'}</td><td>{actual === undefined ? '—' : Math.abs(predicted - actual)}</td><td><div className="pick-bars" aria-hidden="true"><span style={{ width: `${predicted / scale * 100}%` }}/>{actual !== undefined && <span style={{ width: `${actual / scale * 100}%` }}/>}</div></td></tr>;
      })}
    </tbody></table>
  </div>;
}

type ComparisonPlayer = {
  person: { userId: number; name: string };
  prediction?: Prediction;
  position: number | null;
  rank?: League['rankings'][number];
};

export function PartyComparison({ rows }: { rows: ComparisonPlayer[] }) {
  const average = (id: string) => {
    const picks = rows.flatMap(row => row.prediction ? [row.prediction.seats[id] ?? 0] : []);
    return picks.length ? picks.reduce((sum, seats) => sum + seats, 0) / picks.length : 0;
  };
  const parties = [...REVEAL_PARTIES].sort((a, b) =>
    (average(b.id) - average(a.id))
    || a.name.localeCompare(b.name, 'he'));
  return <section className="party-comparison" aria-label="תחזיות לפי מפלגה">
    <h2 className="party-summary-title">תמונת הגושים והתחזיות</h2>
    <p className="party-comparison-hint">מנדטים לכל מפלגה · ממוינים לפי ממוצע התחזיות · ניתן לגלול לצדדים</p>
    <div className="party-comparison-scroll" tabIndex={0} role="region" aria-label="טבלת תחזיות לפי מפלגה">
      <table className="party-comparison-table">
        <caption className="sr-only">השוואת תחזיות המשתתפים לפי מפלגה</caption>
        <thead><tr><th scope="col">גושים ומפלגות</th>
          {rows.map(({ person, prediction }) => <th scope="col" key={person.userId}>
            <span>{person.name}</span>{prediction?.pickName && <small>{prediction.pickName}</small>}
            {!prediction && <small>לא הוגשה</small>}
          </th>)}
        </tr></thead>
        <tbody>{parties.map(party => <tr key={party.id}>
          <th scope="row">{party.name}</th>
          {rows.map(({ person, prediction }) => <td key={person.userId}>{prediction ? prediction.seats[party.id] ?? 0 : '—'}</td>)}
        </tr>)}</tbody>
        <tbody className="party-bloc-totals">
          {([{ id: 'coalition', name: 'קואליציה' }, { id: 'opposition', name: 'אופוזיציה' }, { id: 'arab', name: 'ערבים' }, { id: 'other', name: 'אחרים' }] as const).map(bloc =>
            <tr key={bloc.id}><th scope="row">{bloc.name}</th>
              {rows.map(({ person, prediction }) => <td key={person.userId}>{prediction
                ? blocTotal(prediction, [bloc.id])
                : '—'}</td>)}
            </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

export function LeagueView({ league, allSurveys, selectedSurveyId, onSelectSurveyId, onOpenCreateLeague, onNavigateToPicker, userPrediction, currentUserId }: LeagueViewProps) {
  const [view, setView] = useState<'rankings' | 'parties' | 'government'>('rankings');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [inspect, setInspect] = useState<string | null>(null);
  // The published feed owns availability and corrections; a cached league response
  // must not reintroduce a withdrawn result or override newer seats.
  const sources = allSurveys.map(localizeSurvey);
  const options = latestElectionResults(sources);
  const selectedSource = sources.find(s => s.id === selectedSurveyId);
  const benchmark = options.find(s => s.id === selectedSurveyId)
    ?? options.find(s => s.channelOrMedia === selectedSource?.channelOrMedia)
    ?? options[0] ?? null;
  const benchmarkLabel = benchmark?.kind === 'exit_poll' ? `דירוג לפי מדגם ${benchmark.channelOrMedia}` : 'דירוג לפי התוצאות הרשמיות';
  const hidden = league.predictionsHidden;
  const turnout = benchmark?.kind === 'official_results'
    ? benchmark.turnoutPercentage ?? (benchmark.id === league.benchmarkSurvey?.id ? league.benchmarkTurnoutPercentage : null) ?? null
    : null;

  // Compatibility for older cached league responses; the server supplies the complete roster.
  const roster: NonNullable<League['participants']> = league.participants ?? [
    ...league.members.map(p => ({ userId: p.userId, name: p.memberName, submitted: true })),
    ...(league.unsubmittedPlayers || []).map(p => ({ userId: Number(p.id), name: p.name, submitted: false })),
  ];
  // Every channel ranks the same revealed picks against that channel's current seats.
  // Cached rankings belong to the server's default source and cannot rank other channels.
  const ranks = [...(benchmark && !hidden ? league.members.map(prediction => {
    const score = calculateScore(prediction.seats, benchmark.seats);
    return { predictionId: prediction.id, error: score.totalScore, exactHits: score.exactHitsCount,
      turnoutDiff: turnout === null || prediction.turnoutPercentage == null ? null : Math.round(Math.abs(prediction.turnoutPercentage - turnout) * 10) / 10 };
  }) : [])].sort((a, b) => a.error - b.error || (a.turnoutDiff ?? 0) - (b.turnoutDiff ?? 0));
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
  return <div dir="rtl" className="league-page">
    <header className="league-header"><div><p className="eyebrow">הליגות שלי</p><h1>{league.name}</h1><p>{league.submittedCount} מתוך {league.totalPlayersCount} הגישו · {league.isLocked ? 'ההגשה נסגרה' : 'הגשה עד'} {formatIsraelTime(league.locksAt)} · שעון ישראל</p></div>
    </header>
    <div className="league-action-bar" role="group" aria-label="פעולות ליגה">
      <button className="button-quiet" onClick={share}><Share2 size={16}/>שיתוף</button>
      <button className="button-quiet" onClick={onOpenCreateLeague}><Plus size={16}/>יצירת ליגה חדשה</button>
    </div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!hidden && view === 'rankings' && options.length > 0 && <div className="league-comparison-control">
      <label htmlFor="league-survey">המדגם לדירוג
        <select id="league-survey" value={benchmark?.id ?? ''} onChange={event => onSelectSurveyId(event.target.value)}>
          {options.map(survey => <option key={survey.id} value={survey.id}>{survey.kind === 'official_results' ? 'תוצאות רשמיות' : `מדגם ${survey.channelOrMedia}`}</option>)}
        </select>
      </label>
      <div className="league-result-heading" aria-live="polite"><h2>{benchmarkLabel}</h2><p>{benchmark?.kind === 'exit_poll' ? 'דירוג זמני · ' : ''}פחות נקודות = תחזית קרובה יותר לתוצאה</p></div>
    </div>}
    {(hidden || view === 'rankings') && <div className="league-table-caption">{hidden ? <p>התחזיות וההערות ייחשפו בתאריך האחרון להגשה, בשעה 20:00 בשעון ישראל.</p> : <><p>{benchmark?.kind === 'official_results' ? 'תוצאות סופיות' : benchmark ? 'מדגם · דירוג זמני' : 'ממתינים לפרסום המדגם · הניקוד יופיע לאחר הפרסום'}</p><details><summary>איך הניקוד עובד?</summary><p>פחות נקודות עדיף: סכום ההפרשים המוחלטים במנדטים. במדגם, נקודות זהות מקנות מקום משותף. בתוצאות הרשמיות, שוויון מוכרע לפי הקרבה לאחוז ההצבעה הרשמי; אם גם הפער הזה זהה, המקום משותף. מפלגות שלא דווחו אינן נכללות בניקוד.</p>{benchmark?.sourceUrl && <a href={benchmark.sourceUrl} target="_blank" rel="noreferrer">מקור הנתונים</a>}</details></>}</div>}
    {!hidden && <div className="league-view-switch" role="group" aria-label="תצוגת ליגה">
      <button aria-pressed={view === 'rankings'} onClick={() => setView('rankings')}>דירוג הליגה</button>
      <button aria-pressed={view === 'parties'} onClick={() => setView('parties')}>תחזיות לפי מפלגה</button>
      <button aria-pressed={view === 'government'} onClick={() => setView('government')}>הרכבת ממשלה</button>
    </div>}
    {!hidden && view === 'government' ? <GovernmentBuilder predictions={league.members}/> : !hidden && view === 'parties' ? <PartyComparison rows={[...rows].sort((a, b) => a.person.name.localeCompare(b.person.name, 'he'))}/> :
    <div className="league-table-scroll"><table className={`league-table ${hidden ? 'before-reveal' : ''}`}>
      <caption className="sr-only">{hidden || !benchmark ? `משתתפי ${league.name}` : `${league.name} · ${benchmarkLabel}`}</caption>
      <thead><tr>{(hidden ? ['שם', 'תחזית'] : ['מקום', 'שם', 'נקודות ↓', 'אחוז הצבעה', 'הכי קרוב', 'הכי רחוק', 'הערה']).map((title, i) => <th key={i} scope="col">{title || <span className="sr-only">פעולות</span>}</th>)}</tr></thead>
      <tbody>{rows.map(({ person, prediction, rank, position }) => {
        const mine = (currentUserId ?? userPrediction?.userId) === person.userId;
        const expanded = !!prediction && inspect === prediction.id;
        const interactive = !hidden && !!prediction;
        const toggle = () => { if (prediction) setInspect(expanded ? null : prediction.id); };
        return <React.Fragment key={person.userId}><tr
          className={[mine ? 'my-league-row' : '', interactive ? 'league-pick-row' : ''].join(' ')}
          tabIndex={interactive ? 0 : undefined}
          aria-expanded={interactive ? expanded : undefined}
          aria-controls={interactive ? `picks-${prediction.id}` : undefined}
          aria-label={interactive ? `התחזית של ${person.name}` : undefined}
          onClick={interactive ? toggle : undefined}
          onKeyDown={interactive ? event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
          } : undefined}>
          {!hidden && <td>{position ?? '—'}</td>}
          <th scope="row"><div className="league-player"><span aria-hidden="true"><Avatar name={person.name} url={person.avatarUrl}/></span><span className="league-player-name">{prediction?.pickName ? <><strong>{prediction.pickName}</strong><small>{person.name}</small></> : person.name}</span></div></th>
          {hidden ? <td>{mine && !league.isLocked && !league.myPickLocked
            ? <button className="text-action" onClick={onNavigateToPicker}>{person.submitted ? 'הוגשה · עדכון' : 'הגשת תחזית'}</button>
            : <span className={`submission-state ${person.submitted ? 'submitted' : ''}`}>{person.submitted ? 'הוגשה' : 'טרם הוגשה'}</span>}
          </td> : <>
            <td className="league-score">{rank?.error ?? '—'}</td>
            <td>{prediction?.turnoutPercentage == null ? '—' : `${prediction.turnoutPercentage}%`}{rank?.turnoutDiff != null && <small>פער {rank.turnoutDiff.toFixed(1)} נק׳ אחוז</small>}</td>
            <td>{highlight(prediction, true)}</td><td>{highlight(prediction, false)}</td>
            <td className="league-note">{prediction ? prediction.note || '—' : <span className="submission-state">לא הוגשה</span>}</td>
          </>}
        </tr>{!hidden && expanded && prediction && <tr id={`picks-${prediction.id}`}><td colSpan={7}><PickDetails prediction={prediction} benchmark={benchmark}/></td></tr>}</React.Fragment>;
      })}</tbody>
    </table></div>}
    {!rows.length && <p>עדיין אין משתתפים בליגה.</p>}


  </div>;
}
