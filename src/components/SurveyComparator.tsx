import React, { useState, useMemo } from 'react';
import { TrendingUp, Target } from 'lucide-react';
import { Survey, SavedPick } from '../types';
import { calculateScore, calculateBlocs } from '../utils/scoring';
import { localizeSurvey, latestPollsByChannel } from '../utils/surveys';
import { PollTrendChart } from './PollTrendChart';
import { PARTIES_LIST } from '../data/parties';

interface SurveyComparatorProps {
  surveys: Survey[];
  picks: SavedPick[];
  picksStatus?: 'loading' | 'ready' | 'error';
  onRetryPicks?: () => void;
}

export const SurveyComparator: React.FC<SurveyComparatorProps> = ({
  surveys: sourceSurveys,
  picks,
  picksStatus = 'ready',
  onRetryPicks,
}) => {
  const selectedPick = picks[0];
  const userSeats = selectedPick?.seats ?? {};
  const surveys = useMemo(() => sourceSurveys.map(localizeSurvey), [sourceSurveys]);

  const [weeksAgo, setWeeksAgo] = useState(0);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'exact' | 'diff'>('all');
  const periods = useMemo(() => {
    const today = new Date();
    const oldest = surveys.map(s => s.date).sort()[0];
    const options = [{ weeks: 0, label: 'הכי עדכני', cutoff: today.toISOString().slice(0, 10) }];
    for (let weeks = 1; oldest; weeks++) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - weeks * 7);
      const cutoff = date.toISOString().slice(0, 10);
      if (cutoff < oldest) break;
      options.push({ weeks, cutoff, label: weeks === 1 ? 'לפני שבוע' : weeks === 2 ? 'לפני שבועיים' : `לפני ${weeks} שבועות` });
    }
    return options;
  }, [surveys]);
  const period = periods.find(p => p.weeks === weeksAgo) ?? periods[0];
  const channelSurveys = useMemo(() => latestPollsByChannel(surveys, period.cutoff), [surveys, period.cutoff]);
  const activeSurvey = channelSurveys.find(s => (s.channelOrMedia || s.title) === selectedChannel) ?? channelSurveys[0];

  // Live user bloc tallies
  const userBlocCounts = useMemo(() => {
    return PARTIES_LIST.filter(p => activeSurvey && Object.hasOwn(activeSurvey.seats, p.id)).reduce(
      (acc, party) => {
        const seats = Number(userSeats[party.id]) || 0;
        acc[party.bloc] = (acc[party.bloc] || 0) + seats;
        return acc;
      },
      { coalition: 0, opposition: 0, arab: 0, other: 0 } as Record<string, number>
    );
  }, [userSeats, activeSurvey]);

  // Survey bloc tallies
  const pollBlocCounts = activeSurvey?.blocs ?? calculateBlocs(activeSurvey?.seats ?? {});

  // Live score calculation
  const scoreResult = useMemo(() => {
    if (!activeSurvey) return null;
    return calculateScore(userSeats, activeSurvey.seats);
  }, [userSeats, activeSurvey]);

  // Compare user prediction against all surveys to find the closest match
  const surveyMatchRankings = useMemo(() => {
    return surveys
      .map((s) => {
        let totalDiff = 0;
        let exactHits = 0;
        PARTIES_LIST.filter(p => Object.hasOwn(s.seats, p.id)).forEach((p) => {
          const u = Number(userSeats[p.id]) || 0;
          const a = Number(s.seats[p.id]) || 0;
          const diff = Math.abs(u - a);
          totalDiff += diff;
          if (diff === 0 && (u > 0 || a > 0)) exactHits += 1;
        });
        return {
          survey: s,
          totalDiff,
          exactHits,
        };
      })
      .sort((a, b) => a.totalDiff - b.totalDiff);
  }, [surveys, userSeats]);

  const closestSurvey = surveyMatchRankings[0];

  // Party rows filtered
  const filteredParties = useMemo(() => {
    return PARTIES_LIST.filter((party) => {
      if (!activeSurvey || !Object.hasOwn(activeSurvey.seats, party.id)) return false;
      const userVal = Number(userSeats[party.id]) || 0;
      const surveyVal = Number(activeSurvey?.seats[party.id]) || 0;
      const diff = Math.abs(userVal - surveyVal);

      if (filterMode === 'exact') {
        return diff === 0 && (userVal > 0 || surveyVal > 0);
      }
      if (filterMode === 'diff') {
        return diff > 0;
      }
      return userVal > 0 || surveyVal > 0;
    });
  }, [userSeats, activeSurvey, filterMode]);

  return (
    <div className="space-y-6 text-slate-900 pb-8">

      <div className="page-heading">
        <div><p className="eyebrow">סקרי הבחירות / תמונת מצב</p><h1>מה הסקרים אומרים?</h1><p>תוצאות הסקרים, מגמות לאורך זמן והשוואה לתחזית שלך.</p></div>
      </div>
      <div className="survey-toolbar">
        <div className="survey-selectors">
          <label>תקופה<select value={period.weeks} onChange={e => setWeeksAgo(Number(e.target.value))}>
            {periods.map(p => <option key={p.weeks} value={p.weeks}>{p.label}</option>)}
          </select></label>
          <label>ערוץ ומכון סקרים<select value={activeSurvey?.channelOrMedia || activeSurvey?.title || ''} onChange={e => setSelectedChannel(e.target.value)} disabled={!channelSurveys.length}>
            {!channelSurveys.length && <option value="">אין סקרים בתקופה הזו</option>}
            {channelSurveys.map(s => <option key={s.id} value={s.channelOrMedia || s.title}>{s.channelOrMedia || s.title} · {s.institute}</option>)}
          </select></label>
          <p className="survey-period-note">{period.weeks ? `הסקר האחרון מכל ערוץ עד ${new Date(`${period.cutoff}T12:00:00Z`).toLocaleDateString('he-IL')}` : 'הסקר האחרון מכל ערוץ'}</p>
        </div>
        <div className="survey-source">{activeSurvey?.sourceUrl && <a href={activeSurvey.sourceUrl} target="_blank" rel="noopener noreferrer">מקור הנתונים</a>}{activeSurvey?.originalSourceUrls?.[0] && <a href={activeSurvey.originalSourceUrls[0]} target="_blank" rel="noopener noreferrer">פרסום הסקר</a>}</div>
      </div>

      {picksStatus === 'loading' && <p role="status">טוענים את התחזית שלך…</p>}
      {picksStatus === 'error' && <p role="alert">לא הצלחנו לטעון את התחזית. <button className="button-quiet" onClick={onRetryPicks}>ניסיון נוסף</button></p>}
      {selectedPick && <div className="survey-pick-selection">
        <p>השוואה לתחזית שלך{selectedPick.pickName && <> · <strong>{selectedPick.pickName}</strong></>}</p>
      </div>}
      <PollTrendChart surveys={surveys} selectedChannel={activeSurvey?.channelOrMedia} />
      {!selectedPick && activeSurvey && <section className="survey-results">
        <h2>תוצאות הסקר · {activeSurvey.channelOrMedia}</h2>
        <p>{activeSurvey.institute} · {activeSurvey.date}</p>
        <div className="survey-result-blocs">{Object.entries(pollBlocCounts).map(([bloc, seats]) => <div key={bloc}><span>{{coalition:'קואליציה', opposition:'אופוזיציה', arab:'מפלגות ערביות', other:'אחרות'}[bloc]}</span><strong>{seats}</strong></div>)}</div>
        <table><thead><tr><th>מפלגה</th><th>מנדטים</th></tr></thead><tbody>{PARTIES_LIST.filter(p => Object.hasOwn(activeSurvey.seats, p.id)).map(p => <tr key={p.id}><td>{p.name}</td><td>{activeSurvey.seats[p.id]}</td></tr>)}</tbody></table>
      </section>}
      {selectedPick && <>
      {/* Bloc comparison */}
      <div className="rounded-lg bg-white text-slate-900 p-5 border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3 mb-4">
          <div className="flex items-center gap-2">

            <span className="font-black text-base sm:text-lg text-slate-900">
              השוואת הגושים: הניחוש שלך מול סקר {activeSurvey?.channelOrMedia}
            </span>
          </div>
          <span className="text-xs text-slate-500">
            {activeSurvey?.institute ? `מכון: ${activeSurvey.institute} • ` : ''}
            תאריך: {activeSurvey?.date}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-center">

          {/* Opposition Bloc */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
            <span className="text-xs text-slate-500 font-bold block">
              גוש איזנקוט / אופוזיציה
            </span>
            <div className="flex items-baseline justify-center gap-1.5 mt-1.5">
              <span className="text-3xl font-black text-slate-700">
                {userBlocCounts.opposition}
              </span>
              <span className="text-xs text-slate-500">
                / בסקר: {pollBlocCounts.opposition}
              </span>
            </div>
            <div className="mt-1 text-[11px] font-bold">
              {userBlocCounts.opposition - pollBlocCounts.opposition === 0 ? (
                <span className="text-slate-700">✓ פגיעה בול</span>
              ) : userBlocCounts.opposition - pollBlocCounts.opposition > 0 ? (
                <span className="text-slate-700">
                  {userBlocCounts.opposition - pollBlocCounts.opposition} מעל הסקר
                </span>
              ) : (
                <span className="text-slate-700">
                  {Math.abs(userBlocCounts.opposition - pollBlocCounts.opposition)} מתחת לסקר
                </span>
              )}
            </div>
          </div>

          {/* Coalition Bloc */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
            <span className="text-xs text-slate-500 font-bold block">
              גוש נתניהו / קואליציה
            </span>
            <div className="flex items-baseline justify-center gap-1.5 mt-1.5">
              <span className="text-3xl font-black text-slate-700">
                {userBlocCounts.coalition}
              </span>
              <span className="text-xs text-slate-500">
                / בסקר: {pollBlocCounts.coalition}
              </span>
            </div>
            <div className="mt-1 text-[11px] font-bold">
              {userBlocCounts.coalition - pollBlocCounts.coalition === 0 ? (
                <span className="text-slate-700">✓ פגיעה בול</span>
              ) : userBlocCounts.coalition - pollBlocCounts.coalition > 0 ? (
                <span className="text-slate-700">
                  {userBlocCounts.coalition - pollBlocCounts.coalition} מעל הסקר
                </span>
              ) : (
                <span className="text-slate-700">
                  {Math.abs(userBlocCounts.coalition - pollBlocCounts.coalition)} מתחת לסקר
                </span>
              )}
            </div>
          </div>

          {/* Arab Parties Bloc */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
            <span className="text-xs text-slate-500 font-bold block">
              מפלגות ערביות
            </span>
            <div className="flex items-baseline justify-center gap-1.5 mt-1.5">
              <span className="text-3xl font-black text-slate-700">
                {userBlocCounts.arab}
              </span>
              <span className="text-xs text-slate-500">
                / בסקר: {pollBlocCounts.arab}
              </span>
            </div>
            <div className="mt-1 text-[11px] font-bold">
              {userBlocCounts.arab - pollBlocCounts.arab === 0 ? (
                <span className="text-slate-700">✓ פגיעה בול</span>
              ) : userBlocCounts.arab - pollBlocCounts.arab > 0 ? (
                <span className="text-slate-700">
                  {userBlocCounts.arab - pollBlocCounts.arab} מעל הסקר
                </span>
              ) : (
                <span className="text-slate-700">
                  {Math.abs(userBlocCounts.arab - pollBlocCounts.arab)} מתחת לסקר
                </span>
              )}
            </div>
          </div>

          {/* Other / Threshold Parties */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
            <span className="text-xs text-slate-500 font-bold block">
              הנדל וזליכה / אחרות
            </span>
            <div className="flex items-baseline justify-center gap-1.5 mt-1.5">
              <span className="text-3xl font-black text-slate-700">
                {userBlocCounts.other}
              </span>
              <span className="text-xs text-slate-500">
                / בסקר: {pollBlocCounts.other}
              </span>
            </div>
            <div className="mt-1 text-[11px] font-bold">
              {userBlocCounts.other - pollBlocCounts.other === 0 ? (
                <span className="text-slate-700">✓ פגיעה בול</span>
              ) : userBlocCounts.other - pollBlocCounts.other > 0 ? (
                <span className="text-slate-700">
                  {userBlocCounts.other - pollBlocCounts.other} מעל הסקר
                </span>
              ) : (
                <span className="text-slate-700">
                  {Math.abs(userBlocCounts.other - pollBlocCounts.other)} מתחת לסקר
                </span>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Summary Score Card */}
      {scoreResult && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 ">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">

              <h3 className="text-base sm:text-lg font-black text-slate-900">
                מדדי דיוק ושגיאות מול {activeSurvey?.channelOrMedia}
              </h3>
            </div>
            {closestSurvey && (
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                הסקר הכי קרוב לניחוש שלך: <strong className="text-slate-900">{closestSurvey.survey.channelOrMedia}</strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500 font-bold">סך שגיאות — פחות עדיף</div>
              <div className="text-3xl font-black text-[#a43128] mt-1">
                {scoreResult.totalScore}
              </div>
              <div className="text-[11px] font-bold text-slate-700 mt-1 truncate">
                {scoreResult.rankTitle}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500 font-bold">פגיעות בול מדויקות</div>
              <div className="text-3xl font-black text-amber-500 mt-1 flex items-center justify-center gap-1">
                <Target className="w-6 h-6 text-amber-500" />
                <span>{scoreResult.exactHitsCount}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-medium">
                מפלגות עם 0 סטייה
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500 font-bold">אחוז דיוק כללי</div>
              <div className="text-3xl font-black text-emerald-600 mt-1 flex items-center justify-center gap-1">
                <TrendingUp className="w-6 h-6 text-emerald-500" />
                <span>{scoreResult.accuracyPercentage}%</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-medium">
                ביחס לתוצאות הסקר
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500 font-bold">סך סטיית מנדטים</div>
              <div className="text-3xl font-black text-slate-800 mt-1">
                {scoreResult.totalSeatDiff}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-medium">
                ממוצע של {(scoreResult.partyBreakdown.length ? (scoreResult.totalSeatDiff / scoreResult.partyBreakdown.length).toFixed(1) : '—')} למפלגה
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Side by side party comparison */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden ">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-900 text-base sm:text-lg">
              פירוט השוואה לפי מפלגות
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              התחזית שהגשת מול {activeSurvey?.title}
            </p>
          </div>

          {/* Filter options */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
                aria-pressed={filterMode === 'all'}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-slate-900 '
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              כל המפלגות
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('exact')}
                aria-pressed={filterMode === 'exact'}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filterMode === 'exact'
                  ? 'bg-white text-emerald-700 '
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              פגיעות בול
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('diff')}
                aria-pressed={filterMode === 'diff'}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filterMode === 'diff'
                  ? 'bg-white text-blue-700 '
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              פערים בלבד
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">מפלגה ויו"ר</th>
                <th className="py-3 px-4 text-center">הניחוש שלך</th>
                <th className="py-3 px-4 text-center">בסקר {activeSurvey?.channelOrMedia}</th>
                <th className="py-3 px-4 text-center">פער והפרש</th>
                <th className="py-3 px-4 text-center hidden md:table-cell">השוואה חזותית</th>
                <th className="py-3 px-4 text-center">דיוק</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredParties.map((party) => {
                const userVal = Number(userSeats[party.id]) || 0;
                const surveyVal = Number(activeSurvey?.seats[party.id]) || 0;
                const diff = userVal - surveyVal;
                const absDiff = Math.abs(diff);
                const isExact = absDiff === 0 && (userVal > 0 || surveyVal > 0);

                return (
                  <tr key={party.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-white text-xs shrink-0 "
                          style={{ backgroundColor: party.color }}
                        >
                          {party.ballotLetter}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {party.name}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {party.leader}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center font-black text-base text-slate-900">
                      {userVal}
                    </td>

                    <td className="py-3.5 px-4 text-center font-black text-base text-[#a43128]">
                      {surveyVal}
                    </td>

                    <td className="py-3.5 px-4 text-center font-bold">
                      {absDiff === 0 ? (
                        <span className="text-emerald-600 font-black">0</span>
                      ) : diff > 0 ? (
                        <span className="text-blue-600">{absDiff} מעל</span>
                      ) : (
                        <span className="text-amber-600">{absDiff} מתחת</span>
                      )}
                    </td>

                    {/* Visual Comparison Bar */}
                    <td className="py-3.5 px-4 hidden md:table-cell">
                      <div className="w-36 mx-auto space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="w-8 text-slate-400 shrink-0">אתה:</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-slate-900 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, (userVal / 40) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="w-8 text-slate-400 shrink-0">סקר:</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-[#a43128] h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, (surveyVal / 40) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {isExact ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold inline-block">
                          ✓ בול פגיעה
                        </span>
                      ) : absDiff <= 2 ? (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold inline-block">
                          סטייה של {absDiff}
                        </span>
                      ) : (
                        <span className="text-rose-600 text-[11px] font-bold inline-block">
                          סטייה של {absDiff}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      </>}
    </div>
  );
};
