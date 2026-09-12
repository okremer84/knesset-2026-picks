import React, { useState } from 'react';
import { Trophy, Lock, Users, Share2 } from 'lucide-react';
import { League, Prediction, Survey, ElectionStage } from '../types';
import { calculateScore } from '../utils/scoring';
import { request } from '../lib/api';
interface LeagueViewProps {
  league: League; allSurveys: Survey[]; selectedSurveyId: string;
  onSelectSurveyId: (id: string) => void; onOpenCreateLeague: () => void;
  onJoinExistingLeagueById: (code: string) => void; onNavigateToPicker: () => void;
  userPrediction?: Prediction; currentUserName?: string;
  onLeagueUpdate?: (league: League) => void;
}
export function LeagueView({ league, allSurveys, onOpenCreateLeague, onJoinExistingLeagueById, onNavigateToPicker, onLeagueUpdate, userPrediction }: LeagueViewProps) {
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<ElectionStage>(league.electionStage || 'voting_open');
  const [surveyId, setSurveyId] = useState(league.targetSurveyId || '');
  const [turnout, setTurnout] = useState('');
  const [inspect, setInspect] = useState<string | null>(null);
  const benchmark = league.benchmarkSurvey;
  const kind = { voting_open: 'opinion_poll', exit_poll: 'exit_poll', final_results: 'official_results' }[stage];
  const eligible = allSurveys.filter(s => s.kind === kind);
  const member = league.members.find(m => m.id === inspect);
  const detail = member && benchmark ? calculateScore(member.seats, benchmark.seats) : null;
  const button = 'px-4 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm hover:bg-slate-50 disabled:opacity-50';
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/?invite=' + league.inviteCode);
      setNotice('קישור ההזמנה הועתק');
    } catch { setError('לא ניתן להעתיק. אפשר לשתף את קוד ההזמנה המוצג.'); }
  }
  async function update(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ league: League }>('/api/leagues/' + league.id + '/stage', {
        stage, targetSurveyId: surveyId,
        ...(stage === 'final_results' ? { benchmarkTurnoutPercentage: Number(turnout) } : {}),
      });
      onLeagueUpdate?.(result.league); setNotice('שלב הליגה וסקר ההשוואה עודכנו');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div dir="rtl" className="space-y-6">
    <section className="bg-slate-950 text-white p-6 rounded-2xl space-y-4">
      <div className="flex flex-wrap justify-between gap-4">
        <div><p className="text-red-400 font-bold flex gap-2"><Trophy size={18}/> ליגת הבחירות</p><h2 className="text-3xl font-black mt-2">{league.name}</h2><p className="text-slate-300 mt-2">{league.description}</p></div>
        <div className="text-sm space-y-2"><p>מנהל הליגה: {league.creatorName}</p><p className="flex gap-2"><Users size={16}/>{league.totalPlayersCount} משתתפים · {league.submittedCount} תחזיות הוגשו</p></div>
      </div>
      <p className="flex gap-2 items-center"><Lock size={16}/>{league.isLocked ? 'התחזיות נעולות' : 'אפשר להגיש ולעדכן עד'} · {new Date(league.locksAt).toLocaleString('he-IL')}</p>
      <div className="flex flex-wrap items-center gap-3"><button onClick={share} className="bg-red-600 px-4 py-2 rounded-xl font-bold flex gap-2"><Share2 size={18}/> הזמנת חברים</button><code dir="ltr" className="break-all text-xs text-slate-300">{league.inviteCode}</code></div>
    </section>
    {error && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded-xl">{error}</p>}
    {notice && <p role="status" className="p-4 bg-emerald-50 text-emerald-800 rounded-xl">{notice}</p>}
    {league.predictionsHidden && <p className="bg-amber-50 border border-amber-200 p-4 rounded-xl">עד מועד הנעילה רק התחזית שלך מוצגת. גם מנהל הליגה אינו יכול לראות תחזיות של אחרים.</p>}
    <section className="border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-5 bg-slate-50">
        <h3 className="text-xl font-black">{league.predictionsHidden ? 'התחזית שלך' : 'טבלת הליגה'}</h3>
        <p className="text-sm text-slate-600 mt-2">פחות שגיאות מנצח: סכום ההפרשים המוחלטים במנדטים. בשוויון — יותר פגיעות מדויקות, ואז קרבה לשיעור ההצבעה הרשמי. שוויון מלא נשאר משותף.</p>
        <p className="text-sm mt-2">ההשוואה השמורה לליגה: {benchmark?.title || 'טרם נבחרה'} {benchmark?.kind !== 'official_results' && '· דירוג זמני'}</p>
        {benchmark?.notReportedPartyIds?.length ? <p className="text-xs text-slate-500 mt-1">מפלגות שלא דווחו בסקר אינן משתתפות בחישוב.</p> : null}
        {benchmark?.sourceUrl && <a className="text-red-700 underline text-sm" href={benchmark.sourceUrl} target="_blank" rel="noreferrer">מקור הנתונים</a>}
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm text-right">
        <thead className="border-y border-slate-200"><tr>{['מקום','משתתף','שגיאות','פגיעות מדויקות','הפרש בשיעור הצבעה','תחזית'].map(x => <th key={x} className="p-4 whitespace-nowrap">{x}</th>)}</tr></thead>
        <tbody>{league.rankings.map((rank, index, ranks) => {
          const prediction = league.members.find(m => m.id === rank.predictionId)!;
          const position = ranks.findIndex(r => r.error === rank.error && r.exactHits === rank.exactHits && r.turnoutDiff === rank.turnoutDiff) + 1;
          return <tr key={rank.predictionId} className="border-b border-slate-100">
            <td className="p-4 font-black">{league.predictionsHidden ? '—' : position}</td><td className="p-4 font-bold">{prediction.memberName}{userPrediction?.id === prediction.id ? ' (אני)' : ''}</td>
            <td className="p-4 text-xl font-black text-red-600">{rank.error}</td><td className="p-4">{rank.exactHits}</td><td className="p-4">{rank.turnoutDiff === null ? 'טרם פורסם' : rank.turnoutDiff.toFixed(1) + '%'}</td>
            <td className="p-4"><button className="underline" onClick={() => setInspect(prediction.id)}>צפייה</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      {!league.members.length && <p className="p-6 text-slate-500">עדיין אין תחזית להצגה.</p>}
      {!league.isLocked && <button onClick={onNavigateToPicker} className="m-4 bg-red-600 text-white px-5 py-3 rounded-xl font-bold">{userPrediction ? 'עדכון התחזית שלי' : 'הגשת תחזית'}</button>}
    </section>
    {!!league.unsubmittedPlayers?.length && <p className="text-sm text-slate-500">טרם הגישו: {league.unsubmittedPlayers.map(p => p.name).join(', ')}</p>}
    {league.isCommissioner && league.electionStage !== 'final_results' && <form onSubmit={update} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-3">
      <h3 className="font-black">ניהול שלב הליגה</h3>
      <p className="text-sm text-slate-600">עדכוני סקרים אינם משנים אוטומטית את ההשוואה השמורה. מדגם ותוצאות רשמיות ניתנים לבחירה רק לאחר פרסומם ונעילת התחזיות.</p>
      <div className="flex flex-wrap gap-3">
        <select aria-label="שלב הליגה" className={button} value={stage} onChange={e => { setStage(e.target.value as ElectionStage); setSurveyId(''); }}>
          {league.electionStage === 'voting_open' && <option value="voting_open">סקר — דירוג זמני</option>}
          <option value="exit_poll" disabled={!league.isLocked}>מדגם</option><option value="final_results" disabled={!league.isLocked}>תוצאות רשמיות</option>
        </select>
        <select required aria-label="סקר להשוואה" className={button + ' max-w-full'} value={surveyId} onChange={e => setSurveyId(e.target.value)}>
          <option value="">בחרו מקור להשוואה</option>{eligible.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        {stage === 'final_results' && <label>שיעור הצבעה רשמי (%)<input className={button} type="number" required min={0} max={100} step={0.1} value={turnout} onChange={e => setTurnout(e.target.value)}/></label>}
        <button className={button} disabled={busy || !surveyId}>{busy ? 'שומר…' : 'שמירת השלב וההשוואה'}</button>
      </div>
    </form>}
    <div className="flex flex-wrap gap-3"><button className={button} onClick={onOpenCreateLeague}>יצירת ליגה נוספת</button><form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); onJoinExistingLeagueById(code.trim()); }}><input aria-label="קוד הזמנה" dir="ltr" placeholder="קוד הזמנה לליגה" value={code} onChange={e => setCode(e.target.value)} required className={button}/><button className={button}>הצטרפות לליגה</button></form></div>
    {member && detail && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-label="פירוט תחזית" className="bg-white p-6 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-auto">
        <div className="flex justify-between"><h3 className="text-xl font-black">{member.memberName} · {detail.totalSeatDiff} שגיאות</h3><button onClick={() => setInspect(null)} className="underline">סגירה</button></div>
        <p className="my-3 text-sm">הוגש: {new Date(member.submittedAt).toLocaleString('he-IL')} · שיעור הצבעה: {member.turnoutPercentage}%</p>
        <p className="my-3">{member.note}</p>
        <table className="w-full text-sm text-right"><thead><tr>{['מפלגה','תחזית','מקור','הפרש'].map(t => <th className="p-2" key={t}>{t}</th>)}</tr></thead><tbody>{detail.partyBreakdown.map(p => <tr className="border-t border-slate-100" key={p.partyId}><td className="p-2">{p.partyName}</td><td className="p-2">{p.predicted}</td><td className="p-2">{p.actual}</td><td className="p-2">{p.diff}</td></tr>)}</tbody></table>
      </section>
    </div>}
  </div>;
}
