import React, { useState } from 'react';
import { Trophy, X } from 'lucide-react';
import { Survey } from '../types';

interface CreateLeagueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateLeague: (name: string, creatorName: string, description?: string, targetSurveyId?: string) => Promise<void>;
  surveys: Survey[];
}

export const CreateLeagueModal: React.FC<CreateLeagueModalProps> = ({
  isOpen,
  onClose,
  onCreateLeague,
  surveys,
}) => {
  const [name, setName] = useState('');
  const [creatorName, setCreatorName] = useState(() => {
    return localStorage.getItem('knesset_fantasy_username') || '';
  });
  const [description, setDescription] = useState('');
  const [selectedSurveyId, setSelectedSurveyId] = useState(surveys[0]?.id || 'kan11-kantar-first');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !creatorName.trim()) {
      setError('שם הליגה ושמך הינם שדות חובה');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      localStorage.setItem('knesset_fantasy_username', creatorName.trim());
      await onCreateLeague(name.trim(), creatorName.trim(), description.trim() || undefined, selectedSurveyId);
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white border border-slate-300 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-black text-slate-900">
              פתיחת ליגת בחירות חדשה
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              שם הליגה *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: החבר'ה מהמילואים, המשפחה, חברים לעבודה..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-800 mb-1">
              השם שלך (מנהל הליגה) *
            </label>
            <input
              type="text"
              required
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder="שמך המלא או כינוי"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-800 mb-1">
              תיאור קצר או חוקים לחברים (אופציונלי)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="למשל: המנצח זוכה בארוחת ערב על חשבון המקום האחרון!"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-800 mb-1">
              סקר ברירת מחדל לחישוב תוצאות
            </label>
            <select
              value={selectedSurveyId}
              onChange={(e) => setSelectedSurveyId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
            >
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.date})
                </option>
              ))}
            </select>
          </div>

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
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-[#e62b1e] hover:bg-[#c92318] text-white font-black transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'יוצר ליגה...' : 'צור ליגה והזמן חברים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
