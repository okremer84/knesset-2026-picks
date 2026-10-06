import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { Trophy, X } from 'lucide-react';
import { Survey } from '../types';
import { useUser } from './AuthGate';
import { resolveOpinionPollId } from '../utils/surveys';

interface CreateLeagueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateLeague: (name: string, creatorName: string, description?: string, targetSurveyId?: string, locksAt?: string) => Promise<void>;
  surveys: Survey[];
}

export const CreateLeagueModal: React.FC<CreateLeagueModalProps> = ({
  isOpen,
  onClose,
  onCreateLeague,
  surveys,
}) => {
  const [name, setName] = useState('');
  const creatorName = useUser().name;
  const [locksAt, setLocksAt] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const opinionPolls = surveys.filter(s => s.kind === 'opinion_poll');
  const resolvedSurveyId = resolveOpinionPollId(surveys, selectedSurveyId);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !creatorName.trim()) {
      setError('שם הליגה ושמך הינם שדות חובה');
      return;
    }

    if (!resolvedSurveyId) { setError('אין כרגע סקר זמין לבחירה'); return; }

    setIsSubmitting(true);
    setError('');

    try {
      await onCreateLeague(name.trim(), creatorName.trim(), description.trim() || undefined, resolvedSurveyId, new Date(locksAt).toISOString());
      setName('');
      setDescription('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'שגיאה ביצירת הליגה');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} label="פתיחת ליגה חדשה">
      <div className="space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-black text-slate-900">
              פתיחת ליגת בחירות חדשה
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label htmlFor="league-name" className="block font-bold text-slate-800 mb-1">
              שם הליגה *
            </label>
            <input autoFocus id="league-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: החבר'ה מהמילואים, המשפחה, חברים לעבודה..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            />
          </div>

          <div>
            <label htmlFor="league-creator" className="block font-bold text-slate-800 mb-1">
              השם שלך (מנהל הליגה) *
            </label>
            <input id="league-creator"
              type="text"
              required
              value={creatorName}
              readOnly
              placeholder="שמך המלא או כינוי"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            />
          </div>

          <div>
            <label htmlFor="league-description" className="block font-bold text-slate-800 mb-1">
              תיאור קצר או חוקים לחברים (אופציונלי)
            </label>
            <textarea id="league-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="למשל: המנצח זוכה בארוחת ערב על חשבון המקום האחרון!"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            />
          </div>

          <div>
            <label htmlFor="league-survey" className="block font-bold text-slate-800 mb-1">
              סקר ברירת מחדל לחישוב תוצאות
            </label>
            <select id="league-survey"
              value={resolvedSurveyId}
              onChange={(e) => setSelectedSurveyId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
            >
              {!resolvedSurveyId && <option value="">אין סקרים זמינים</option>}
              {opinionPolls.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.date})
                </option>
              ))}
            </select>
          </div>

          <label className="block font-bold">מועד נעילת התחזיות (לפי השעון המקומי שלך) *
            <input type="datetime-local" required value={locksAt} onChange={e => setLocksAt(e.target.value)} className="w-full border rounded-xl p-3 mt-2"/>
            <span className="block text-slate-500 mt-1">לאחר מועד זה לא ניתן להצטרף או לעדכן תחזיות.</span>
          </label>
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !resolvedSurveyId}
              className="px-5 py-2.5 rounded-xl bg-[#a43128] hover:bg-[#87281f] text-white font-black transition-colors  cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'יוצר ליגה...' : 'צור ליגה והזמן חברים'}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
};
