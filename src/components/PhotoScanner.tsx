import React, { useState } from 'react';
import { Camera, Upload, Sparkles, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Survey } from '../types';
import { calculateScore } from '../utils/scoring';
import { PARTIES_LIST } from '../data/parties';

interface PhotoScannerProps {
  userSeats: Record<string, number>;
  onNewSurveyScanned: (survey: Survey) => void;
  onNavigateToPicker: () => void;
}

export const PhotoScanner: React.FC<PhotoScannerProps> = ({
  userSeats,
  onNewSurveyScanned,
  onNavigateToPicker,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedSurvey, setScannedSurvey] = useState<Survey | null>(null);

  // Check if user has allocated 120 seats
  const totalUserSeats = PARTIES_LIST.reduce(
    (sum, p) => sum + (Number(userSeats[p.id]) || 0),
    0
  );
  const hasCompletePrediction = totalUserSeats === 120;

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('אנא העלה קובץ תמונה תקין (PNG, JPG, WebP)');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await scanImage(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const scanImage = async (base64: string, mimeType: string) => {
    setIsScanning(true);
    setError(null);

    try {
      const res = await fetch('/api/surveys/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || 'נכשלה סריקת התמונה');
      }

      setScannedSurvey(data.survey);
      onNewSurveyScanned(data.survey);
    } catch (err: any) {
      console.error('Scan error:', err);
      setError(
        err.message || 'לא הצלחנו לפענח את התמונה. נסה להעלות צילום מסך ברור יותר של גרף הסקר.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  // Demo shortcut: load the Kan 11 screenshot sample poll directly
  const loadKan11Demo = () => {
    const kanSurvey: Survey = {
      id: 'kan11-demo-' + Date.now(),
      title: 'סקר כאן חדשות (מכון קאנטאר) - הסקר הראשון אחרי סגירת הרשימות',
      institute: 'מכון קאנטאר בראשות דודי חסיד',
      channelOrMedia: 'כאן 11',
      date: '2026-03-05',
      sampleSize: 554,
      notes: 'סקר כאן 11: עמך ישראל של עופר וינטר עוברת (4), המילואימניקים (2.9%) וכחול לבן (1.4%) מתחת לאחוז החסימה',
      seats: {
        yashar: 24,
        likud: 22,
        beyachad: 13,
        democrats: 10,
        israel_beitenu: 9,
        utj: 8,
        shas: 7,
        joint_list: 7,
        otzma_yehudit: 6,
        religious_zionism: 5,
        raam: 5,
        amcha: 4,
        hendel: 0,
        kachol_lavan: 0,
        balad: 0,
        other_parties: 0,
      },
      blocs: {
        coalition: 52,
        opposition: 56,
        arab: 12,
        other: 0,
      },
    };

    setScannedSurvey(kanSurvey);
    onNewSurveyScanned(kanSurvey);
  };

  // Calculate score if a survey is scanned and user has prediction
  const scoreResult =
    scannedSurvey && hasCompletePrediction
      ? calculateScore(userSeats, scannedSurvey.seats)
      : null;

  return (
    <div className="space-y-6 bg-white text-slate-900 pb-12">
      
      {/* Intro Header */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Camera className="w-6 h-6 text-[#e62b1e]" />
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                סריקת סקר מתמונה באמצעות AI
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl font-medium">
              ראית צילום מסך של סקר בטלוויזיה (כמו גרף סקר כאן 11) או ברשתות? העלה אותו לכאן!
              מודל ה-AI יפענח את המנדטים של כל מפלגה ויחשב מיידית כמה נקודות היית מקבל.
            </p>
          </div>

          <button
            onClick={loadKan11Demo}
            className="px-4 py-2.5 rounded-xl bg-[#e62b1e] hover:bg-[#c92318] text-white text-xs font-black flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            טען סקר כאן 11 לדוגמה
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
          isScanning
            ? 'border-red-400 bg-red-50/50'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'
        }`}
      >
        {isScanning ? (
          <div className="py-8 space-y-4">
            <RefreshCw className="w-12 h-12 text-[#e62b1e] animate-spin mx-auto" />
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">
                Gemini מפענח את תמונת הסקר...
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                זיהוי שמות המפלגות, מספרי המנדטים, המכון הסוקר וחלוקת הגושים
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 text-[#e62b1e] flex items-center justify-center mx-auto shadow-sm">
              <Upload className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900">
                גרור לכאן תמונה של סקר בחירות או לחץ לבחירת קובץ
              </h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                תומך בצילומי מסך משידורי החדשות (כאן 11, ערוץ 12, ערוץ 14) ועיתונים
              </p>
            </div>

            <label className="inline-block px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer transition-colors shadow-sm">
              <span>בחר תמונה מהמכשיר</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
            </label>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Prediction reminder if not complete */}
      {!hasCompletePrediction && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-4 font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
            <span>
              עדיין לא השלמת חלוקה של 120 מנדטים בניחוש האישי שלך ({totalUserSeats}/120).
              השלם תחילה את הניחוש כדי לראות כמה נקודות היית מקבל!
            </span>
          </div>
          <button
            onClick={onNavigateToPicker}
            className="px-4 py-2 rounded-xl bg-[#e62b1e] hover:bg-[#c92318] text-white font-black text-xs shrink-0 cursor-pointer shadow-sm"
          >
            להשלמת הניחוש
          </button>
        </div>
      )}

      {/* Scanned Survey Results & Points Breakdown */}
      {scannedSurvey && (
        <div className="space-y-6">
          
          {/* Survey Metadata Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                  פוענח בהצלחה על ידי AI
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1.5">
                  {scannedSurvey.title}
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                  <span>מכון: {scannedSurvey.institute}</span>
                  <span>•</span>
                  <span>גוף שידור: {scannedSurvey.channelOrMedia}</span>
                  {scannedSurvey.sampleSize && (
                    <>
                      <span>•</span>
                      <span>מדגם: {scannedSurvey.sampleSize} נשאלים</span>
                    </>
                  )}
                </div>
              </div>

              {scannedSurvey.blocs && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
                    <div className="text-slate-500 text-[10px] font-bold">קואליציה</div>
                    <div className="text-sm font-black text-slate-900">
                      {scannedSurvey.blocs.coalition}
                    </div>
                  </div>
                  <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
                    <div className="text-slate-500 text-[10px] font-bold">אופוזיציה</div>
                    <div className="text-sm font-black text-[#e62b1e]">
                      {scannedSurvey.blocs.opposition}
                    </div>
                  </div>
                  <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
                    <div className="text-slate-500 text-[10px] font-bold">ערביות</div>
                    <div className="text-sm font-black text-emerald-700">
                      {scannedSurvey.blocs.arab}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Score Highlight if user has completed prediction */}
            {scoreResult && (
              <div className="mt-6 p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500 font-medium">
                    לפי {scannedSurvey.channelOrMedia}, היית מקבל:
                  </div>
                  <div className="text-3xl font-black text-slate-900 mt-0.5 flex items-baseline gap-2">
                    <span className="text-[#e62b1e]">{scoreResult.totalScore}</span>
                    <span className="text-sm font-normal text-slate-500">
                      מתוך {scoreResult.maxScore} נקודות
                    </span>
                  </div>
                  <div className="text-xs text-emerald-700 font-bold mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {scoreResult.exactHitsCount} מפלגות נוחשו בול פגיעה! ({scoreResult.accuracyPercentage}% דיוק כללי)
                  </div>
                </div>

                <div className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-center shadow-sm">
                  <div className="text-[10px] text-slate-500 font-medium">דירוג השגה</div>
                  <div className="text-sm font-bold text-slate-900">
                    {scoreResult.rankTitle}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Party Comparison Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-black text-slate-900 text-sm">
                השוואת מנדטים לפי מפלגה (התחזית שלך מול תוצאות הסקר)
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">מפלגה</th>
                    <th className="py-3 px-4 text-center">מנדטים בסקר</th>
                    <th className="py-3 px-4 text-center">הניחוש שלך</th>
                    <th className="py-3 px-4 text-center">פער מנדטים</th>
                    <th className="py-3 px-4 text-center">נקודות שהרווחת</th>
                    <th className="py-3 px-4 text-center">סטטוס פגיעה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PARTIES_LIST.map((party) => {
                    const actual = Number(scannedSurvey.seats[party.id]) || 0;
                    const predicted = Number(userSeats[party.id]) || 0;
                    const diff = Math.abs(predicted - actual);
                    const isExact = diff === 0 && (actual > 0 || predicted > 0);

                    // Skip parties that both have 0
                    if (actual === 0 && predicted === 0) return null;

                    let partyPoints = Math.max(0, 10 - diff * 2);
                    if (isExact) partyPoints += 2;

                    return (
                      <tr key={party.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-white text-[10px]"
                              style={{ backgroundColor: party.color }}
                            >
                              {party.ballotLetter}
                            </span>
                            <div>
                              <span className="font-bold text-slate-900 text-sm">
                                {party.name}
                              </span>
                              <span className="text-[10px] text-slate-500 mr-2">
                                ({party.leader})
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center font-black text-sm text-[#e62b1e]">
                          {actual}
                        </td>

                        <td className="py-3 px-4 text-center font-black text-sm text-slate-900">
                          {predicted}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {diff === 0 ? (
                            <span className="text-emerald-600 font-bold">0</span>
                          ) : (
                            <span className="text-slate-600 font-semibold">±{diff}</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center font-bold text-amber-600">
                          +{partyPoints} נק'
                        </td>

                        <td className="py-3 px-4 text-center">
                          {isExact ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                              ✓ בול פגיעה!
                            </span>
                          ) : diff <= 2 ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold">
                              קרוב מאוד
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">
                              סטייה של {diff}
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
        </div>
      )}

    </div>
  );
};
