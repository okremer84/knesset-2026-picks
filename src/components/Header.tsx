import React from 'react';
import { Trophy, CheckCircle2, BarChart3, History, Share2, Users, PlusCircle } from 'lucide-react';
import { League } from '../types';

interface HeaderProps {
  activeTab: 'picker' | 'league' | 'scanner' | 'surveys' | 'historical';
  setActiveTab: (tab: 'picker' | 'league' | 'scanner' | 'surveys' | 'historical') => void;
  currentLeague: League | null;
  onOpenCreateLeague: () => void;
  onShareLeague: () => void;
  predictedCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentLeague,
  onOpenCreateLeague,
  onShareLeague,
  predictedCount,
}) => {
  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Brand & League Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 space-x-reverse">
              <div className="w-10 h-10 rounded-xl bg-[#e62b1e] flex items-center justify-center shadow-md text-white font-black text-xl tracking-tight">
                120
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-1.5">
                    פנטזי בחירות לכנסת
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-red-50 text-[#e62b1e] border border-red-200 font-bold">
                      הכנסת ה-26
                    </span>
                  </h1>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">
                  ניחוש 120 המנדטים, תחרויות מול חברים והשוואה בזמן אמת לסקרי הטלוויזיה
                </p>
              </div>
            </div>

            {/* Mobile Actions */}
            <div className="flex md:hidden items-center gap-2">
              {currentLeague && (
                <button
                  onClick={onShareLeague}
                  className="p-2 rounded-lg bg-red-50 text-[#e62b1e] hover:bg-red-100 text-sm flex items-center gap-1 border border-red-200"
                  title="שתף ליגה"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onOpenCreateLeague}
                className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm border border-slate-200"
                title="צור ליגה"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active League Pill & Actions (Desktop) */}
          <div className="hidden md:flex items-center gap-3">
            {currentLeague ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <Users className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-slate-500">ליגה פעילה:</span>
                <span className="font-bold text-slate-900 max-w-[160px] truncate">
                  {currentLeague.name}
                </span>
                <span className="bg-slate-200 px-1.5 py-0.5 rounded text-[11px] font-bold text-slate-700">
                  {currentLeague.members.length} משתתפים
                </span>
                <button
                  onClick={onShareLeague}
                  className="mr-1 text-[#e62b1e] hover:text-red-700 transition-colors flex items-center gap-1 font-bold cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  הזמן
                </button>
              </div>
            ) : null}

            <button
              onClick={onOpenCreateLeague}
              className="px-3.5 py-2 rounded-xl bg-[#e62b1e] hover:bg-[#c92318] text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              צור ליגה חדשה
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 space-x-reverse overflow-x-auto mt-2 pt-2 border-t border-slate-100 no-scrollbar">
          <button
            onClick={() => setActiveTab('picker')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'picker'
                ? 'bg-[#e62b1e] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>לוח הניחוש (120 מנדטים)</span>
            {predictedCount === 120 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('surveys')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'surveys'
                ? 'bg-[#e62b1e] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>השוואה לסקרים</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                activeTab === 'surveys'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              מתעדכן חי
            </span>
          </button>

          <button
            onClick={() => setActiveTab('league')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'league'
                ? 'bg-[#e62b1e] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>טבלת הליגה והניקוד</span>
            {currentLeague && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'league' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {currentLeague.members.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('historical')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'historical'
                ? 'bg-[#e62b1e] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4" />
            <span>ארכיון ומגמות עבר</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
