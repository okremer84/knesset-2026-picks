import React, { useState, useEffect } from 'react';
import { Prediction } from '../types';
import { sameSeats } from '../utils/predictionDraft';
import { Dialog } from './Dialog';
import { AlertCircle, Send, Award, Plus, Minus, X } from 'lucide-react';


import { PARTIES_LIST } from '../data/parties';
import { LeaderPortrait } from './LeaderPortrait';

interface SeatPickerProps {
  currentSeats: Record<string, number>;
  onSeatsChange: (seats: Record<string, number>) => void;
  onSubmitPrediction: (pickName: string, note?: string, turnoutPercentage?: number) => Promise<void>;
  isSubmitting: boolean;
  prediction?: Prediction;
  isLoading?: boolean;
  isLocked: boolean;
}

export const SeatPicker: React.FC<SeatPickerProps> = ({
  currentSeats,
  onSeatsChange,
  onSubmitPrediction,
  isSubmitting,
  prediction,
  isLoading = false,
  isLocked,
}) => {
  const [pickName, setPickName] = useState(prediction?.pickName || '');
  const [turnoutPercentage, setTurnoutPercentage] = useState(String(prediction?.turnoutPercentage ?? ''));
  const [note, setNote] = useState(prediction?.note || '');
  useEffect(() => {
    if (prediction) { setPickName(prediction.pickName || ''); setTurnoutPercentage(String(prediction.turnoutPercentage ?? '')); setNote(prediction.note || ''); }
  }, [prediction?.id, prediction?.submittedAt]);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Calculate total seats allocated by user
  const totalAllocated = PARTIES_LIST.reduce((sum, party) => {
    const val = currentSeats[party.id];
    return sum + (typeof val === 'number' && !isNaN(val) ? val : 0);
  }, 0);

  const hasChanges = prediction && (!sameSeats(currentSeats, prediction.seats)
    || pickName.trim() !== (prediction.pickName || '')
    || note.trim() !== (prediction.note || '')
    || turnoutPercentage !== String(prediction.turnoutPercentage ?? ''));
  const submissionStatus = isLoading ? 'טוענים את מצב ההגשה…' : isSubmitting ? 'שומרים את התחזית…'
    : !prediction ? 'טיוטה — התחזית עדיין לא הוגשה'
    : hasChanges ? 'יש שינויים שלא הוגשו — התחזית הקודמת עדיין בתוקף'
    : 'התחזית הוגשה — אין שינויים שלא הוגשו';

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
    
    // Construct sanitized seats containing strictly valid PARTIES_LIST keys
    const nextSeats: Record<string, number> = {};
    PARTIES_LIST.forEach((p) => {
      if (p.id === partyId) {
        nextSeats[p.id] = clamped;
      } else {
        const existing = Number(currentSeats[p.id]);
        nextSeats[p.id] = !isNaN(existing) && existing >= 0 ? existing : 0;
      }
    });
    onSeatsChange(nextSeats);
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
    if (!pickName.trim()) {
      setErrorMessage('נא להזין שם לתחזית');
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

    const turnoutNum = parseFloat(turnoutPercentage);
    if (isNaN(turnoutNum) || turnoutNum < 30 || turnoutNum > 100) {
      setErrorMessage('נא להזין שיעור הצבעה תקין בין 30% ל-100% (למשל 71.5%) כשובר שוויון');
      return;
    }


    try {
      await onSubmitPrediction(pickName.trim(), note.trim() || undefined, Math.round(turnoutNum * 10) / 10);
    } catch (e) {
      setErrorMessage((e as Error).message || 'התחזית לא נשמרה');
      return;
    }

    setShowSubmitModal(false);

  };

  const handleBottomSubmit = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isExact120) return;
    setErrorMessage('');
    setShowSubmitModal(true);
  };

  return (
    <div className="picker-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">הכנסת ה־26 / התחזית שלך</p>
          <h1>איך תיראה הכנסת הבאה?</h1>
          <p>בחרו את מספר המנדטים שכל מפלגה תקבל לדעתכם</p>
        </div>

      </div>

      <div className={`prediction-submission-status ${prediction && !hasChanges ? 'is-submitted' : ''}`}>
        <p role="status">{submissionStatus}</p>
        {!isLoading && !isSubmitting && !isLocked && prediction && hasChanges && <button type="button" className="button-quiet" onClick={() => {
          onSeatsChange(prediction.seats);
          setPickName(prediction.pickName || '');
          setNote(prediction.note || '');
          setTurnoutPercentage(String(prediction.turnoutPercentage ?? ''));
        }}>חזרה לתחזית שהוגשה</button>}
      </div>

      <div className="party-grid">
        {PARTIES_LIST.map(party => {
          const seats = Number(currentSeats[party.id]) || 0;
          return <article key={party.id} className={`party-card ${seats > 0 ? 'has-seats' : ''}`}>
            <LeaderPortrait party={party}/>
            <div className="seat-control">
              <button type="button" disabled={isLocked || seats >= 120} onClick={() => handleAdjust(party.id, 1)} aria-label={`הוספת מנדט ל${party.name}`}><Plus size={16}/></button>
              <input type="text" inputMode="numeric" pattern="[0-9]*" disabled={isLocked} aria-label={`מנדטים ל${party.name}`} value={seats || ''} placeholder="0" onChange={e => handleSeatChange(party.id, e.target.value.replace(/[^0-9]/g, ''))}/>
              <button type="button" disabled={isLocked || seats === 0} onClick={() => handleAdjust(party.id, -1)} aria-label={`הפחתת מנדט ל${party.name}`}><Minus size={16}/></button>
            </div>
          </article>;
        })}
      </div>

      <div className="prediction-dock">
        <div className="prediction-progress" role="progressbar" aria-label="מנדטים שחולקו" aria-valuemin={0} aria-valuemax={120} aria-valuenow={Math.min(120, totalAllocated)} aria-valuetext={`${totalAllocated} מתוך 120 מנדטים`}><span style={{ width: `${Math.min(100, totalAllocated / 120 * 100)}%` }}/></div>
        <div className="prediction-dock-content">
          <div className="prediction-total"><strong dir="ltr">{totalAllocated}<small> / 120</small></strong><span role="status">{isLocked ? 'התחזית נעולה' : isExact120 ? (prediction && !hasChanges ? 'התחזית הוגשה' : 'מוכנה להגשה — טרם נשלחה') : diffFrom120 === 1 ? 'מנדט אחד יותר מדי' : diffFrom120 > 0 ? `יש לך ${diffFrom120} מנדטים יותר מדי` : diffFrom120 === -1 ? 'חסר מנדט אחד' : `עוד ${Math.abs(diffFrom120)} מנדטים לחלוקה`}</span></div>
          <div className="bloc-summary" aria-label="חלוקת המנדטים לפי גושים">
            <span>קואליציה <strong>{userBlocCounts.coalition}</strong></span>
            <span>אופוזיציה <strong>{userBlocCounts.opposition}</strong></span>
            <span>מפלגות ערביות <strong>{userBlocCounts.arab}</strong></span>
            <span>עצמאיות <strong>{userBlocCounts.other}</strong></span>
          </div>
          <div className="prediction-actions">
          <button className="button-primary" disabled={!isExact120 || isSubmitting || isLocked || isLoading} onClick={handleBottomSubmit}>{isLoading ? 'טוען…' : isLocked ? 'ההגשה נסגרה' : isSubmitting ? 'שומר…' : prediction ? 'עדכון התחזית' : 'הגשת התחזית'}</button>
            <button className="reset-draft" disabled={isLocked || totalAllocated === 0} onClick={() => {
              if (window.confirm('לאפס את כל המנדטים בטיוטה? התחזית שכבר הוגשה לא תימחק.')) handleResetToBlank();
            }}>איפוס הטיוטה</button>
          </div>
        </div>
      </div>

      {/* Submit Prediction Modal Dialog */}
      {showSubmitModal && (
        <Dialog open={showSubmitModal} onClose={() => setShowSubmitModal(false)} label="הגשת התחזית">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    הגשת התחזית
                  </h3>

                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                aria-label="סגירה"
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 text-right">
                  שם התחזית
                </label>
                <input
                  type="text"
                  required
                  aria-label="שם התחזית"
                  value={pickName}
                  onChange={e => setPickName(e.target.value)}
                  maxLength={100}
                  placeholder="למשל: Best pickssss i ruleeee"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm shadow-xs"
                />
              </div>

              {/* Tiebreaker: Turnout Percentage */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-900 text-right">
                    תחזית אחוז הצבעה ארצי (שובר שוויון)
                  </label>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="30"
                    max="100"
                    required
                    aria-label="תחזית אחוז הצבעה ארצי"
                    autoFocus
                    value={turnoutPercentage}
                    onChange={(e) => setTurnoutPercentage(e.target.value)}
                    placeholder=""
                    className="w-full px-3.5 py-2.5 pl-9 bg-white border border-slate-300 rounded-xl text-slate-900 font-black placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm shadow-xs"
                  />
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
                    %
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 leading-relaxed text-right">
                  <strong>איך עובד שובר השוויון?</strong> אם שני משתתפים יסיימו בתיקו בניקוד, מי שניחש את שיעור ההצבעה הארצי הקרוב ביותר לתוצאה בפועל ינצח בדירוג.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 text-right">
                  הערה (אופציונלי)
                </label>
                <input
                  type="text"
                  aria-label="הערה לתחזית"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="למשל: זליכה יביא אוטובוסים לקלפיות"
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
                  disabled={isSubmitting || !pickName.trim()}
                  className={`flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                    !isSubmitting && pickName.trim()
                      ? 'bg-[#a43128] hover:bg-[#87281f] text-white shadow-red-500/25'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'שומר תחזית...' : 'שלח תחזית'}</span>
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
        </Dialog>
      )}

    </div>
  );
};
