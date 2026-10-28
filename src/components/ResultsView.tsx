import React, { useState } from 'react';
import type { Survey, SavedPick, ResultSync } from '../types';
import { latestElectionResults, isActualResult } from '../utils/surveys';
import { calculateScore, calculateBlocs } from '../utils/scoring';
import { PARTIES_LIST } from '../data/parties';
import { ResultStatus } from './ResultStatus';

export function ResultsView({ surveys, sync, picks, picksStatus = 'ready', onRetryPicks }: {
  surveys: Survey[]; sync?: ResultSync | null; picks: SavedPick[];
  picksStatus?: 'loading' | 'ready' | 'error'; onRetryPicks?: () => void;
}) {
  const [pickId, setPickId] = useState('');
  const pick = picks.find(p => p.id === pickId) ?? picks[0];
  const result = latestElectionResults(surveys.filter(isActualResult))[0];
  const score = pick && result ? calculateScore(pick.seats, result.seats) : null;
  const blocs = result ? calculateBlocs(result.seats) : null;
  const parties = [...PARTIES_LIST].sort((a, b) => (result?.seats[b.id] ?? 0) - (result?.seats[a.id] ?? 0));
  return <section className="actual-results-page" dir="rtl">
    <div className="page-heading"><div><p className="eyebrow">בחירות 2026 / ספירת הקולות</p><h1>תוצאות אמת</h1><p>חלוקת המנדטים והשוואה לתחזיות שהוגשו.</p></div></div>
    {!result ? <p role="status">ממתינים לפרסום תוצאות האמת.</p> : <>
      <ResultStatus result={result} sync={sync}/>
      <div className="survey-result-blocs">{Object.entries(blocs!).map(([bloc, seats]) => <div key={bloc}><span>{{ coalition: 'קואליציה', opposition: 'אופוזיציה', arab: 'מפלגות ערביות', other: 'אחרות' }[bloc]}</span><strong>{seats}</strong></div>)}</div>
      {picksStatus === 'loading' && <p role="status">טוענים את התחזית שלך…</p>}
      {picksStatus === 'error' && <p role="alert">לא הצלחנו לטעון את התחזית. <button onClick={onRetryPicks} className="button-quiet">ניסיון נוסף</button></p>}
      {pick && <div className="survey-pick-selection">
        {picks.length > 1 && <label>תחזית להשוואה <select value={pick.id} onChange={e => setPickId(e.target.value)}>
          {picks.map(p => <option key={p.id} value={p.id}>{p.leagueName || 'תחזית אישית'}{p.pickName ? ` · ${p.pickName}` : ''}</option>)}
        </select></label>}
        <p>השוואה לתחזית שלך{pick.pickName ? ` · ${pick.pickName}` : ''}</p>
        <p className="actual-results-score"><strong>{score!.totalScore}</strong> נקודות · פחות נקודות = תחזית קרובה יותר לתוצאה</p>
      </div>}
      <div className="survey-results"><table>
        <caption className="sr-only">{pick ? 'השוואת התחזית לתוצאות האמת' : 'מנדטים לפי תוצאות האמת'}</caption>
        <thead><tr><th>מפלגה</th>{pick && <th>תחזית</th>}<th>תוצאות אמת</th>{pick && <th>הפרש</th>}</tr></thead>
        <tbody>{parties.map(party => <tr key={party.id}>
          <th scope="row">{party.name}</th>{pick && <td>{pick.seats[party.id] ?? 0}</td>}<td>{result.seats[party.id] ?? 'לא דווח'}</td>
          {pick && <td>{result.seats[party.id] == null ? '—' : Math.abs((pick.seats[party.id] ?? 0) - result.seats[party.id])}</td>}
        </tr>)}
        {(pick?.seats.balad ?? 0) > 0 && <tr><th scope="row">בל״ד (בתחזית המקורית)</th><td>{pick!.seats.balad}</td><td>{result.seats.balad ?? 'לא דווח'}</td><td>{result.seats.balad == null ? '—' : Math.abs(pick!.seats.balad - result.seats.balad)}</td></tr>}
        </tbody>
      </table></div>
    </>}
  </section>;
}
