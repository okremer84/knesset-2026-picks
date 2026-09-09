import React, { useState } from 'react';
import { History, TrendingUp, BookOpen, CheckCircle2 } from 'lucide-react';
import { HISTORICAL_ELECTIONS, HISTORICAL_INSIGHTS } from '../data/historical';
import { calculateScore } from '../utils/scoring';
import { PARTIES_LIST } from '../data/parties';

interface HistoricalAnalysisProps {
  userSeats: Record<string, number>;
  onNavigateToPicker: () => void;
}

export const HistoricalAnalysis: React.FC<HistoricalAnalysisProps> = ({
  userSeats,
}) => {
  const [selectedKnessetNumber, setSelectedKnessetNumber] = useState<number>(25);

  const selectedElection =
    HISTORICAL_ELECTIONS.find((e) => e.knessetNumber === selectedKnessetNumber) ||
    HISTORICAL_ELECTIONS[0];

  const totalUserSeats = PARTIES_LIST.reduce(
    (sum, p) => sum + (Number(userSeats[p.id]) || 0),
    0
  );
  const isPredictionComplete = totalUserSeats === 120;

  // Convert election results to Record<partyId, seats> for comparison
  const historicalBenchmarkSeats: Record<string, number> = {};
  selectedElection.results.forEach((r) => {
    if (r.partyName.includes('הליכוד')) historicalBenchmarkSeats['likud'] = r.seats;
    else if (r.partyName.includes('סמוטריץ') || r.partyName.includes('הציונות הדתית')) {
      historicalBenchmarkSeats['religious_zionism'] = r.seats;
    } else if (r.partyName.includes('כחול לבן')) historicalBenchmarkSeats['kachol_lavan'] = r.seats;
    else if (r.partyName.includes('המחנה הממלכתי')) historicalBenchmarkSeats['yashar'] = r.seats;
    else if (r.partyName.includes('ש"ס')) historicalBenchmarkSeats['shas'] = r.seats;
    else if (r.partyName.includes('יהדות התורה')) historicalBenchmarkSeats['utj'] = r.seats;
    else if (r.partyName.includes('ישראל ביתנו')) historicalBenchmarkSeats['israel_beitenu'] = r.seats;
    else if (r.partyName.includes('רע"ם')) historicalBenchmarkSeats['raam'] = r.seats;
    else if (r.partyName.includes('חד"ש') || r.partyName.includes('המשותפת')) {
      historicalBenchmarkSeats['joint_list'] = r.seats;
    } else if (r.partyName.includes('העבודה') || r.partyName.includes('מרצ')) {
      historicalBenchmarkSeats['democrats'] = (historicalBenchmarkSeats['democrats'] || 0) + r.seats;
    } else if (r.partyName.includes('ימינה')) {
      historicalBenchmarkSeats['beyachad'] = r.seats;
    }
  });

  const historicalScore = isPredictionComplete
    ? calculateScore(userSeats, historicalBenchmarkSeats)
    : null;

  return (
    <div className="space-y-6 bg-white text-slate-900 pb-12">
      
      {/* Intro Header */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <History className="w-6 h-6 text-[#e62b1e]" />
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">
            ארכיון הבחירות לכנסת וניתוח מגמות
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl font-medium">
          סקירה היסטורית של הבחירות האחרונות בישראל (הכנסת ה-22 עד ה-25),
          סטיות הסקרים מתוצאות האמת, וניתוח השפעת אחוז החסימה על מפת המנדטים.
        </p>

        {/* Knesset Selector Pills */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 no-scrollbar">
          {HISTORICAL_ELECTIONS.map((election) => (
            <button
              key={election.knessetNumber}
              onClick={() => setSelectedKnessetNumber(election.knessetNumber)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedKnessetNumber === election.knessetNumber
                  ? 'bg-[#e62b1e] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              הכנסת ה-{election.knessetNumber} ({election.date.split(' ').pop()})
            </button>
          ))}
        </div>
      </div>

      {/* Selected Election Detail Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <span className="text-xs font-black text-[#e62b1e]">
              {selectedElection.date} • אחוז הצבעה: {selectedElection.turnoutPercentage}%
            </span>
            <h3 className="text-xl font-black text-slate-900 mt-1">
              {selectedElection.knessetName}
            </h3>
            <div className="text-xs text-slate-600 mt-0.5 font-medium">
              ראש ממשלה נבחר / תוצאה: <strong className="text-slate-900">{selectedElection.primeMinisterElected}</strong>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
              <div className="text-slate-500 text-[10px] font-bold">גוש קואליציה</div>
              <div className="text-base font-black text-slate-900">
                {selectedElection.blocTotals.coalition}
              </div>
            </div>
            <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
              <div className="text-slate-500 text-[10px] font-bold">גוש אופוזיציה</div>
              <div className="text-base font-black text-[#e62b1e]">
                {selectedElection.blocTotals.opposition}
              </div>
            </div>
            <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
              <div className="text-slate-500 text-[10px] font-bold">מפלגות ערביות</div>
              <div className="text-base font-black text-emerald-700">
                {selectedElection.blocTotals.arab}
              </div>
            </div>
          </div>
        </div>

        {/* Key Events & Poll vs Reality Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#e62b1e]" />
              אירועים מרכזיים והכרעת הבחירות
            </div>
            <p className="text-slate-600 leading-relaxed font-medium">
              {selectedElection.keyEvents}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              הסקרים מול תוצאות האמת
            </div>
            <p className="text-slate-600 leading-relaxed font-medium">
              {selectedElection.pollVsRealityNotes}
            </p>
          </div>
        </div>

        {/* Results Bar / Party List */}
        <div>
          <h4 className="text-xs font-bold text-slate-800 mb-3">
            תוצאות הבחירות לפי מפלגות:
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
            {selectedElection.results.map((r, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-900">{r.partyName}</div>
                  <div className="text-[10px] text-slate-500">{r.leader}</div>
                </div>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-white text-base shrink-0 shadow-sm"
                  style={{ backgroundColor: r.color }}
                >
                  {r.seats}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Test your prediction against this historical election */}
        {isPredictionComplete && historicalScore && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                בדיקת התחזית שלך מול תוצאות האמת של הכנסת ה-{selectedElection.knessetNumber}:
              </div>
              <div className="text-emerald-800 mt-0.5">
                אם הבחירות היו מסתיימות בדיוק כמו בכנסת ה-{selectedElection.knessetNumber}, היית מקבל{' '}
                <strong className="text-emerald-950 text-sm">{historicalScore.totalScore} נקודות</strong>{' '}
                ({historicalScore.accuracyPercentage}% דיוק).
              </div>
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-white text-emerald-800 font-bold shrink-0 border border-emerald-300 shadow-sm">
              {historicalScore.rankTitle}
            </div>
          </div>
        )}
      </div>

      {/* Historical Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {HISTORICAL_INSIGHTS.map((insight, idx) => (
          <div
            key={idx}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2 text-xs"
          >
            <div className="font-black text-slate-900 text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-red-50 text-[#e62b1e] border border-red-200 flex items-center justify-center font-black text-xs">
                {idx + 1}
              </span>
              {insight.title}
            </div>
            <p className="text-slate-600 leading-relaxed font-medium">
              {insight.content}
            </p>
          </div>
        ))}
      </div>

    </div>
  );
};
