import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Award,
  BarChart3,
  Plus,
  Minus,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PARTIES_LIST } from '../data/parties';
import { LeaderPortrait } from './LeaderPortrait';

interface SeatPickerProps {
  currentSeats: Record<string, number>;
  onSeatsChange: (seats: Record<string, number>) => void;
  onSubmitPrediction: (memberName: string, note?: string) => Promise<void>;
  isSubmitting: boolean;
  activeLeagueName?: string;
  onNavigateToSurveys?: () => void;
}

export const SeatPicker: React.FC<SeatPickerProps> = ({
  currentSeats,
  onSeatsChange,
  onSubmitPrediction,
  isSubmitting,
  activeLeagueName,
  onNavigateToSurveys,
}) => {
  const [memberName, setMemberName] = useState(() => {
    return localStorage.getItem('knesset_fantasy_username') || '';
  });
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Calculate total seats allocated by user
  const totalAllocated = PARTIES_LIST.reduce((sum, party) => {
    const val = currentSeats[party.id];
    return sum + (typeof val === 'number' && !isNaN(val) ? val : 0);
  }, 0);

  const diffFrom120 = totalAllocated - 120;
  const isExact120 = totalAllocated === 120;

  // Calculate user bloc counts based purely on their own picks
  const userBlocCounts = PARTIES_LIST.reduce(
    (acc, party) => {
      const seats = Number(currentSeats[party.id]) || 0;
      acc[party.bloc] = (acc[party.bloc] || 0) + seats;
      return acc;
    },
    { coalition: 0, opposition: 0, arab: 0, other: 0 } as Record<string, number>
  );

  const handleSeatChange = (partyId: string, val: number | string) => {
    let numVal: number;
    if (typeof val === 'string') {
      if (val.trim() === '') {
        numVal = 0;
      } else {
        numVal = parseInt(val, 10);
      }
    } else {
      numVal = val;
    }
    const clamped = Math.max(0, Math.min(120, isNaN(numVal) ? 0 : numVal));
    onSeatsChange({
      ...currentSeats,
      [partyId]: clamped,
    });
    setErrorMessage('');
  };

  const handleAdjust = (partyId: string, delta: number) => {
    const current = Number(currentSeats[partyId]) || 0;
    handleSeatChange(partyId, current + delta);
  };

  // Blank all fields
  const handleResetToBlank = () => {
    const empty: Record<string, number> = {};
    PARTIES_LIST.forEach((p) => {
      empty[p.id] = 0;
    });
    onSeatsChange(empty);
    setErrorMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim()) {
      setErrorMessage('נא להזין את שמך עבור טבלת הליגה');
      return;
    }

    if (!isExact120) {
      if (diffFrom120 < 0) {
        setErrorMessage(`חסרים עוד ${Math.abs(diffFrom120)} מנדטים כדי להגיע ל-120 בדיוק`);
      } else {
        setErrorMessage(`חרגת ב-${diffFrom120} מנדטים. יש להפחית כדי להגיע לבדיוק 120`);
      }
      return;
    }

    localStorage.setItem('knesset_fantasy_username', memberName.trim());

    try {
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      });
    } catch {
      // Confetti fallback
    }

    await onSubmitPrediction(memberName.trim(), note.trim() || undefined);
    setShowSubmitModal(false);
  };

  const handleBottomSubmit = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isExact120) return;
    setErrorMessage('');
    setShowSubmitModal(true);
  };

  return (
    <div className="space-y-8 bg-white text-slate-900 pb-0">
      
      {/* Header: Pure filling and editing picks */}
      <div className="bg-white border-b border-slate-200 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-red-50 text-[#e62b1e] font-black text-xs px-2.5 py-0.5 rounded-full border border-red-200">
                לוח ניחוש אישי
              </span>
              <span className="text-xs text-slate-500 font-medium">
                הכנסת ה-26
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mt-1">
              לוח הניחוש של 120 המנדטים
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              הזינו או ערכו את מנדטי הניחוש לכל מפלגה. ההשוואה מול הסקרים מתעדכנת אוטומטית בלשונית "השוואה לסקרים".
            </p>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {onNavigateToSurveys && (
              <button
                type="button"
                onClick={onNavigateToSurveys}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-300 cursor-pointer shadow-sm"
                title="מעבר להשוואה מול הסקרים"
              >
                <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                השוואה לסקרים
              </button>
            )}

            <button
              type="button"
              onClick={handleResetToBlank}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-300 cursor-pointer"
              title="איפוס כל השדות לשדות ריקים"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              איפוס שדות
            </button>
          </div>
        </div>
      </div>

      {/* Broadcast Party Cards Layout - Purely filling and editing your picks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>לוח מפלגות וראשי רשימות</span>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              {PARTIES_LIST.length} מפלגות
            </span>
          </h2>
          <span className="text-xs text-slate-500 hidden sm:inline">
            הזינו את מספר המנדטים החזוי תחת כל מפלגה
          </span>
        </div>

        {/* Cards Grid: White background, picture of leader, red party banner, clean editable number field */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
          {PARTIES_LIST.map((party) => {
            const currentVal = currentSeats[party.id];
            const userSeatsForParty =
              typeof currentVal === 'number' && !isNaN(currentVal) ? currentVal : 0;

            return (
              <div
                key={party.id}
                className="bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-400 overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col group"
              >
                {/* Picture of the Candidate/Leader from TV Broadcast Screenshot */}
                <LeaderPortrait party={party} hideName={false} />

                {/* Number input field with [+] and [-] controls directly under picture */}
                <div className="p-2 bg-white border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    {/* Increment (+) */}
                    <button
                      type="button"
                      onClick={() => handleAdjust(party.id, 1)}
                      className="w-7 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95 flex items-center justify-center transition-all cursor-pointer border border-slate-200 hover:border-slate-300 shadow-xs shrink-0"
                      title="הוסף מנדט"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>

                    {/* The Clean Text Field (No browser spin arrows, comfortable double digits) */}
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={userSeatsForParty === 0 ? '' : userSeatsForParty}
                      onChange={(e) => {
                        const sanitized = e.target.value.replace(/[^0-9]/g, '');
                        handleSeatChange(party.id, sanitized);
                      }}
                      placeholder="0"
                      className={`min-w-0 flex-1 h-9 text-center font-black text-lg rounded-lg border-2 transition-all focus:outline-none focus:ring-2 px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        userSeatsForParty > 0
                          ? 'border-slate-900 bg-white text-slate-900 focus:ring-red-500'
                          : 'border-slate-200 bg-slate-50 text-slate-400 focus:bg-white focus:text-slate-900 focus:ring-red-500'
                      }`}
                    />

                    {/* Decrement (-) */}
                    <button
                      type="button"
                      onClick={() => handleAdjust(party.id, -1)}
                      disabled={userSeatsForParty <= 0}
                      className="w-7 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-25 disabled:hover:bg-slate-100 disabled:hover:border-slate-200 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center transition-all cursor-pointer border border-slate-200 hover:border-slate-300 shadow-xs shrink-0"
                      title="הפחת מנדט"
                    >
                      <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky Slide at the Bottom: Progress Bar, X/120 Counter, Compact Blocs, and Submit Button */}
      <div className="sticky bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_25px_rgba(0,0,0,0.1)] py-2.5 px-4 sm:px-6 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          {/* Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                totalAllocated > 120
                  ? 'bg-red-600'
                  : isExact120
                  ? 'bg-emerald-500'
                  : 'bg-slate-900'
              }`}
              style={{
                width: `${Math.min(100, (totalAllocated / 120) * 100)}%`,
              }}
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 sm:gap-3">
            {/* Counter + Mobile Submit Button */}
            <div className="flex items-center justify-between md:justify-start gap-4">
              <div
                className={`text-2xl sm:text-3xl font-black tracking-tight shrink-0 ${
                  totalAllocated > 120
                    ? 'text-red-600'
                    : isExact120
                    ? 'text-emerald-600'
                    : 'text-slate-900'
                }`}
              >
                <span>{totalAllocated}</span>
                <span
                  className={`text-sm sm:text-base font-bold mr-1 ${
                    totalAllocated > 120 ? 'text-red-500' : 'text-slate-400'
                  }`}
                >
                  / 120
                </span>
              </div>

              <div className="md:hidden">
                <button
                  type="button"
                  disabled={!isExact120 || isSubmitting}
                  onClick={handleBottomSubmit}
                  className={`px-4 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                    isExact120 && !isSubmitting
                      ? 'bg-[#e62b1e] hover:bg-[#c92318] text-white cursor-pointer shadow-red-500/25'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'שומר...' : 'הגש תחזית לליגה'}</span>
                </button>
              </div>
            </div>

            {/* Compact Blocs: גוש אופוזיציה: X גוש קואליציה: Y מפלגות ערביות: Z מפלגות עצמאיות: XX */}
            <div className="flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-3.5 gap-y-1 text-xs sm:text-sm text-slate-700 bg-slate-50 py-1.5 px-3 rounded-xl border border-slate-200/80">
              <span className="whitespace-nowrap font-medium">
                גוש אופוזיציה:{' '}
                <strong className="font-black text-sky-700 text-sm">
                  {userBlocCounts.opposition}
                </strong>
              </span>
              <span className="text-slate-300 select-none">|</span>
              <span className="whitespace-nowrap font-medium">
                גוש קואליציה:{' '}
                <strong className="font-black text-blue-700 text-sm">
                  {userBlocCounts.coalition}
                </strong>
              </span>
              <span className="text-slate-300 select-none">|</span>
              <span className="whitespace-nowrap font-medium">
                מפלגות ערביות:{' '}
                <strong className="font-black text-emerald-700 text-sm">
                  {userBlocCounts.arab}
                </strong>
              </span>
              <span className="text-slate-300 select-none">|</span>
              <span className="whitespace-nowrap font-medium">
                מפלגות עצמאיות:{' '}
                <strong className="font-black text-purple-700 text-sm">
                  {userBlocCounts.other}
                </strong>
              </span>
            </div>

            {/* Desktop Submit Button */}
            <div className="hidden md:block">
              <button
                type="button"
                disabled={!isExact120 || isSubmitting}
                onClick={handleBottomSubmit}
                className={`px-6 sm:px-8 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                  isExact120 && !isSubmitting
                    ? 'bg-[#e62b1e] hover:bg-[#c92318] text-white cursor-pointer shadow-red-500/25'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'שומר תחזית...' : 'הגש תחזית לליגה'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Prediction Modal Dialog */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    הגשת התחזית לליגה
                  </h3>
                  {activeLeagueName && (
                    <p className="text-xs font-semibold text-slate-500">
                      ליגת "{activeLeagueName}"
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 text-right">
                  שם השחקן / הניחוש שלך *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="למשל: דני לוי, נבחרת המשרד..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 text-right">
                  הערה / מוטו לתחזית (אופציונלי)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="למשל: בונה על הפתעה של הרגע האחרון"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm shadow-xs"
                />
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !memberName.trim()}
                  className={`flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                    !isSubmitting && memberName.trim()
                      ? 'bg-[#e62b1e] hover:bg-[#c92318] text-white shadow-red-500/25'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'שומר תחזית...' : 'אישור והגשת התחזית'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-3 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
