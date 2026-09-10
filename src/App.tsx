import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SeatPicker } from './components/SeatPicker';
import { LeagueView } from './components/LeagueView';
import { apiFetch as fetch } from './lib/api';
import { useUser } from './components/AuthGate';
import { SurveyComparator } from './components/SurveyComparator';
import { HistoricalAnalysis } from './components/HistoricalAnalysis';
import { CreateLeagueModal } from './components/CreateLeagueModal';
import { DEFAULT_SURVEYS } from './data/surveys';
import { PARTIES_LIST } from './data/parties';
import { League, Prediction, Survey } from './types';
import { CheckCircle2, AlertCircle, Share2, Copy } from 'lucide-react';

export default function App() {
  const user = useUser();
  const [surveyNotice, setSurveyNotice] = useState('מציגים עותק שמור של הסקרים עד לקבלת עדכון מהשרת');
  const [joinCode, setJoinCode] = useState('');
  const [myLeagues, setMyLeagues] = useState<League[]>([]);
  const [activeTab, setActiveTab] = useState<'picker' | 'league' | 'surveys' | 'historical'>('picker');
  const [allSurveys, setAllSurveys] = useState<Survey[]>(DEFAULT_SURVEYS);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>(DEFAULT_SURVEYS[0]?.id || '');
  const [currentLeague, setCurrentLeague] = useState<League | null>(null);
  const [isCreateLeagueModalOpen, setIsCreateLeagueModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loadingLeague, setLoadingLeague] = useState(true);

  // Helper to sanitize any raw seats object to strictly PARTIES_LIST keys
  const sanitizeSeatsMap = (raw: any): Record<string, number> => {
    const clean: Record<string, number> = {};
    if (!raw || typeof raw !== 'object') {
      return clean;
    }
    PARTIES_LIST.forEach((p) => {
      const val = Number(raw[p.id]);
      if (!isNaN(val) && val > 0) {
        clean[p.id] = Math.min(120, Math.floor(val));
      }
    });
    return clean;
  };

  // User's current draft seats (starts empty by default, strictly sanitized)
  const [userSeats, setUserSeats] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('knesset_fantasy_user_seats_' + user.id);
      if (saved) {
        return sanitizeSeatsMap(JSON.parse(saved));
      }
    } catch {
      // Fallback
    }
    // Start empty by default as requested
    return {};
  });

  // Calculate total seats allocated by user (only valid parties)
  const totalUserSeats = PARTIES_LIST.reduce(
    (sum, p) => sum + (Number(userSeats[p.id]) || 0),
    0
  );

  // Persist draft seats to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('knesset_fantasy_user_seats_' + user.id, JSON.stringify(userSeats));
    } catch {
      // Ignore
    }
  }, [userSeats]);

  // Load surveys from backend
  useEffect(() => {
    fetch('/api/surveys')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.surveys) && data.surveys.length) {
          setAllSurveys(data.surveys);
          setSurveyNotice(data.sync?.status === 'failed' ? 'עדכון הסקרים האחרון נכשל. מוצגים הנתונים מהעדכון התקין האחרון.' : '');
        }
      })
      .catch(() => setSurveyNotice('לא ניתן לטעון סקרים מהשרת. מוצג עותק שמור עם תאריכי המקור.'));
  }, []);

  // Old leagues may still reference demo survey IDs.
  useEffect(() => {
    if (allSurveys.length && !allSurveys.some(s => s.id === selectedSurveyId)) {
      setSelectedSurveyId(allSurveys[0].id);
    }
  }, [allSurveys, selectedSurveyId]);

  // Load league based on URL parameter or fetch active league
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leagueParam = params.get('league');
    const invite = params.get('invite');
    if (invite) { handleJoinExistingLeagueById(invite).finally(() => setLoadingLeague(false)); return; }

    setLoadingLeague(true);
    if (leagueParam) {
      fetch(`/api/leagues/${leagueParam}`)
        .then((res) => {
          if (!res.ok) throw new Error('League not found');
          return res.json();
        })
        .then((data) => {
          if (data.league) {
            setCurrentLeague(data.league);
      setMyLeagues(prev => [data.league, ...prev.filter(l => l.id !== data.league.id)]);
            if (data.league.targetSurveyId) {
              setSelectedSurveyId(data.league.targetSurveyId);
            }
          }
        })
        .catch(() => {
          // Fallback to list
          fetchFirstLeague();
        })
        .finally(() => setLoadingLeague(false));
    } else {
      fetchFirstLeague();
    }
  }, []);

  const fetchFirstLeague = () => {
    fetch('/api/leagues')
      .then((res) => res.json())
      .then((data) => {
        if (data.leagues && data.leagues.length > 0) {
          setMyLeagues(data.leagues);
          setCurrentLeague(data.leagues[0]);
          if (data.leagues[0].targetSurveyId) {
            setSelectedSurveyId(data.leagues[0].targetSurveyId);
          }
        }
      })
      .catch((err) => console.error('Error fetching leagues:', err))
      .finally(() => setLoadingLeague(false));
  };

  const showToast = (text: string, type?: 'success' | 'error' | 'info') => {
    let resolvedType: 'success' | 'error' | 'info' = type || 'success';
    if (!type) {
      if (
        text.includes('שגיאה') ||
        text.includes('חייב להיות') ||
        text.includes('חרגת') ||
        text.includes('חסר') ||
        text.includes('לא נמצא')
      ) {
        resolvedType = 'error';
      }
    }
    setToast({ text, type: resolvedType });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Submit user's prediction to the active league
  const handleSubmitPrediction = async (memberName: string, note?: string, turnoutPercentage?: number) => {
    if (!currentLeague) {
      throw new Error('לא נמצאה ליגה פעילה. אנא צור ליגה תחילה.');
    }

    // Always sanitize to strictly PARTIES_LIST keys with integer values
    const cleanSeats: Record<string, number> = {};
    let totalAllocated = 0;
    PARTIES_LIST.forEach((p) => {
      const count = Math.max(0, Math.floor(Number(userSeats[p.id]) || 0));
      cleanSeats[p.id] = count;
      totalAllocated += count;
    });

    if (totalAllocated !== 120) {
      showToast(
        `סך המנדטים חייב להיות בדיוק 120. כרגע הוזנו ${totalAllocated} מנדטים.`,
        'error'
      );
      return;
    }

    // Update local state to clean representation
    setUserSeats(cleanSeats);

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/leagues/${currentLeague.id}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberName,
          seats: cleanSeats,
          note,
          turnoutPercentage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'שגיאה בשמירת התחזית');
      }

      setCurrentLeague(data.league);
      setMyLeagues(prev => [data.league, ...prev.filter(l => l.id !== data.league.id)]);
      showToast('התחזית שלך נשמרה בהצלחה בליגה! 🎉', 'success');
      setActiveTab('league');
    } catch (err: any) {
      console.error('Submit prediction error:', err);
      showToast(err.message || 'שגיאה בשמירת התחזית לליגה', 'error');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create new league
  const handleCreateLeague = async (
    name: string,
    creatorName: string,
    description?: string,
    targetSurveyId?: string,
    locksAt?: string
  ) => {
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        locksAt,
        description,
        targetSurveyId,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'נכשלה יצירת הליגה');
    }

    setCurrentLeague(data.league);
      setMyLeagues(prev => [data.league, ...prev.filter(l => l.id !== data.league.id)]);
    if (data.league.targetSurveyId) {
      setSelectedSurveyId(data.league.targetSurveyId);
    }

    // Update URL query parameter without full reload
    const newUrl = `${window.location.pathname}?league=${data.league.id}`;
    window.history.pushState({ path: newUrl }, '', newUrl);

    showToast(`ליגת "${data.league.name}" נוצרה בהצלחה! שתף את הקישור עם החברים.`);
    setActiveTab('league');
  };

  // Switch / Join league by ID
  const handleJoinExistingLeagueById = async (leagueId: string) => {
    try {
      const res = await fetch('/api/leagues/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({code: leagueId}) });
      const data = await res.json();
      if (!res.ok || !data.league) {
        showToast('לא נמצאה ליגה עם קוד זה. בדוק את הקוד ונסה שוב.');
        return;
      }

      setCurrentLeague(data.league);
      setMyLeagues(prev => [data.league, ...prev.filter(l => l.id !== data.league.id)]);
      const newUrl = `${window.location.pathname}?league=${data.league.id}`;
      window.history.pushState({ path: newUrl }, '', newUrl);

      showToast(`עברת בהצלחה לליגת "${data.league.name}"!`);
      setActiveTab('league');
    } catch (err) {
      showToast('שגיאה בטעינת הליגה');
    }
  };

  // Share league link
  const handleShareLeague = () => {
    if (!currentLeague) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?invite=${currentLeague.inviteCode}`;

    if (navigator.share) {
      navigator
        .share({
          title: `ליגת הבחירות לכנסת: ${currentLeague.name}`,
          text: `הצטרפו לליגת הבחירות לכנסת "${currentLeague.name}" בפנטזי בחירות! מי ינחש הכי קרוב ל-120 המנדטים?`,
          url: shareUrl,
        })
        .catch(() => {
          navigator.clipboard.writeText(shareUrl);
          showToast('קישור הליגה הועתק ללוח!');
        });
    } else {
      navigator.clipboard.writeText(shareUrl);
      showToast('קישור הליגה הועתק ללוח!');
    }
  };

  const username = user.name;
  const userPrediction = currentLeague?.members.find(m => m.userId === user.id);
  useEffect(() => {
    if (userPrediction) setUserSeats(userPrediction.seats);
  }, [currentLeague?.id, userPrediction?.submittedAt]);

  // Refresh deadlines, standings and invitations without trusting the browser clock.
  useEffect(() => {
    if (!currentLeague) return;
    const refresh = () => fetch('/api/leagues/' + currentLeague.id).then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.league) setCurrentLeague(data.league); }).catch(() => {});
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [currentLeague?.id]);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed top-20 right-4 sm:right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold transition-all border backdrop-blur-md ${
            toast.type === 'error'
              ? 'bg-red-950/95 border-red-500/80 text-white shadow-red-950/40'
              : toast.type === 'info'
              ? 'bg-slate-900/95 border-blue-500/80 text-white shadow-black/40'
              : 'bg-slate-900/95 border-emerald-500/80 text-white shadow-black/40'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white mr-1 text-base leading-none p-0.5 cursor-pointer"
            aria-label="סגור"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentLeague={currentLeague}
        onOpenCreateLeague={() => setIsCreateLeagueModalOpen(true)}
        onShareLeague={handleShareLeague}
        predictedCount={totalUserSeats}
      />

      {/* Main Content Area */}
      {surveyNotice && <p role="status" className="max-w-7xl mx-auto w-full px-6 pt-4 text-sm text-amber-800">{surveyNotice}</p>}
      {myLeagues.length > 1 && <label className="max-w-7xl mx-auto w-full px-6 pt-4 text-sm">הליגות שלי <select value={currentLeague?.id || ''} onChange={e => { window.location.href = '/?league=' + e.target.value; }} className="border rounded-lg p-2">{myLeagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      {currentLeague?.isLocked && <p className="max-w-7xl mx-auto w-full px-6 pt-4 text-amber-800">התחזיות בליגה נעולות. אפשר להמשיך להשוות סקרים, אך לא לשנות את התחזית שהוגשה.</p>}
      <main className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 ${activeTab === 'picker' ? 'pt-6 sm:pt-8 pb-0' : 'py-6 sm:py-8'}`}>
        {activeTab === 'picker' && (
          <SeatPicker
            currentSeats={userSeats}
            onSeatsChange={setUserSeats}
            onSubmitPrediction={handleSubmitPrediction}
            isSubmitting={isSubmitting || !!currentLeague?.isLocked}
            activeLeagueName={currentLeague?.name}
            onNavigateToSurveys={() => setActiveTab('surveys')}
          />
        )}

        {activeTab === 'league' && (
          currentLeague ? (
            <LeagueView
              key={currentLeague.id}
              league={currentLeague}
              allSurveys={allSurveys}
              selectedSurveyId={selectedSurveyId}
              onSelectSurveyId={setSelectedSurveyId}
              onOpenCreateLeague={() => setIsCreateLeagueModalOpen(true)}
              onJoinExistingLeagueById={handleJoinExistingLeagueById}
              onNavigateToPicker={() => setActiveTab('picker')}
              userPrediction={userPrediction}
              currentUserName={username}
              onLeagueUpdate={(updatedLeague) => setCurrentLeague(updatedLeague)}
            />
          ) : (
            <div className="text-center py-16 bg-slate-50 border border-slate-200 rounded-2xl p-8">
              <p className="text-slate-500 text-sm mb-4">{loadingLeague ? 'טוען נתוני ליגה…' : 'עדיין לא הצטרפת לליגה'}</p>
              {!loadingLeague && <div className="space-y-4">
                <button className="bg-red-600 text-white px-4 py-2 rounded-xl" onClick={() => setIsCreateLeagueModalOpen(true)}>יצירת ליגה</button>
                <form onSubmit={e => { e.preventDefault(); handleJoinExistingLeagueById(joinCode.trim()); }} className="flex gap-2 justify-center flex-wrap"><input aria-label="קוד הזמנה" className="border rounded-xl p-2" value={joinCode} onChange={e => setJoinCode(e.target.value)} required placeholder="קוד הזמנה"/><button className="border rounded-xl p-2">הצטרפות לליגה</button></form>
              </div>}
            </div>
          )
        )}



        {activeTab === 'surveys' && (
          <SurveyComparator
            surveys={allSurveys}
            userSeats={userSeats}
            onNavigateToPicker={() => setActiveTab('picker')}
          />
        )}

        {activeTab === 'historical' && (
          <HistoricalAnalysis
            userSeats={userSeats}
            onNavigateToPicker={() => setActiveTab('picker')}
          />
        )}
      </main>

      {/* Broadcast Studio Footer (for non-picker tabs) */}
      {activeTab !== 'picker' && (
        <footer className="border-t border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="font-medium text-slate-700">
              פנטזי בחירות לכנסת ה-26 • מיועד לחובבי פוליטיקה, חברים ומשפחות
            </div>
            <div className="flex items-center gap-4 text-slate-500 font-medium">
              <span>120 מנדטים בדיוק</span>
              <span>•</span>
              <span>נתוני סקרים מוויקיפדיה</span>
              <span>•</span>
              <span>סקרי דעת קהל אינם תוצאות רשמיות</span>
            </div>
          </div>
        </footer>
      )}

      {/* Create League Modal */}
      <CreateLeagueModal
        isOpen={isCreateLeagueModalOpen}
        onClose={() => setIsCreateLeagueModalOpen(false)}
        onCreateLeague={handleCreateLeague}
        surveys={allSurveys}
      />
    </div>
  );
}
