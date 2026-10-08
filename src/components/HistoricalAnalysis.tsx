import React, { useState } from 'react';
import { TrendingUp, BookOpen } from 'lucide-react';
import { HISTORICAL_ELECTIONS, HISTORICAL_INSIGHTS } from '../data/historical';

export const HistoricalAnalysis: React.FC = () => {
  const [selectedKnessetNumber, setSelectedKnessetNumber] = useState<number>(25);

  const selectedElection =
    HISTORICAL_ELECTIONS.find((e) => e.knessetNumber === selectedKnessetNumber) ||
    HISTORICAL_ELECTIONS[0];

  return (
    <div className="space-y-6 text-slate-900 pb-8">
      
      <div>
        <div className="page-heading"><div><p className="eyebrow">ארכיון / הכנסת ה־22 עד ה־25</p><h1>מה קרה בפעם הקודמת?</h1><p>תוצאות האמת, הפתעות הסקרים ואחוז החסימה בבחירות האחרונות.</p></div></div>
        {/* Knesset Selector Pills */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 no-scrollbar">
          {HISTORICAL_ELECTIONS.map((election) => (
            <button
              key={election.knessetNumber}
              onClick={() => setSelectedKnessetNumber(election.knessetNumber)}
              aria-pressed={selectedKnessetNumber === election.knessetNumber}
              className={`px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap cursor-pointer ${
                selectedKnessetNumber === election.knessetNumber
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              הכנסת ה-{election.knessetNumber} ({election.date.split(' ').pop()})
            </button>
          ))}
        </div>
      </div>

      {/* Selected Election Detail Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6  space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <span className="text-xs font-black text-[#a43128]">
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
              <div className="text-base font-black text-[#a43128]">
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
              <BookOpen className="w-4 h-4 text-[#a43128]" />
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
                  className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-white text-base shrink-0 "
                  style={{ backgroundColor: r.color }}
                >
                  {r.seats}
                </div>
              </div>
            ))}
          </div>
        </div>


      </div>

      {/* Historical Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {HISTORICAL_INSIGHTS.map((insight, idx) => (
          <div
            key={idx}
            className="bg-white border border-slate-200 rounded-2xl p-5  space-y-2 text-xs"
          >
            <div className="font-black text-slate-900 text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-red-50 text-[#a43128] border border-red-200 flex items-center justify-center font-black text-xs">
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
