import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SeatPicker } from './components/SeatPicker';
import { LeagueView } from './components/LeagueView';
import { PhotoScanner } from './components/PhotoScanner';
import { SurveyComparator } from './components/SurveyComparator';
import { HistoricalAnalysis } from './components/HistoricalAnalysis';
import { CreateLeagueModal } from './components/CreateLeagueModal';
import { DEFAULT_SURVEYS } from './data/surveys';
import { PARTIES_LIST } from './data/parties';
import { League, Prediction, Survey } from './types';
import { CheckCircle2, AlertCircle, Share2, Copy } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'picker' | 'league' | 'scanner' | 'surveys' | 'historical'>('picker');
  const [allSurveys, setAllSurveys] = useState<Survey[]>(DEFAULT_SURVEYS);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>(DEFAULT_SURVEYS[0]?.id || '');
  const [currentLeague, setCurrentLeague] = useState<League | null>(null);
  const [isCreateLeagueModalOpen, setIsCreateLeagueModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loadingLeague, setLoadingLeague] = useState(true);

  // User's current draft seats (starts empty by default)
  const [userSeats, setUserSeats] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('knesset_fantasy_user_seats_v2');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }
    // Start empty by default as requested
    return {};
  });

  // Calculate total seats allocated by user
  const totalUserSeats = PARTIES_LIST.reduce(
    (sum, p) => sum + (Number(userSeats[p.id]) || 0),
    0
  );

  // Persist draft seats to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('knesset_fantasy_user_seats_v2', JSON.stringify(userSeats));
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
        }
      })
      .catch((err) => console.log('Using default surveys:', err));
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
          setCurrentLeague(data.leagues[0]);
          if (data.leagues[0].targetSurveyId) {
            setSelectedSurveyId(data.leagues[0].targetSurveyId);
          }
        }
      })
      .catch((err) => console.error('Error fetching leagues:', err))
      .finally(() => setLoadingLeague(false));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Submit user's prediction to the active league
  const handleSubmitPrediction = async (memberName: string, note?: string) => {
    if (!currentLeague) {
      showToast('לא נמצאה ליגה פעילה. אנא צור ליגה תחילה.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/leagues/${currentLeague.id}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberName,
          seats: userSeats,
          note,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'שגיאה בשמירת התחזית');
      }

      setCurrentLeague(data.league);
      showToast('התחזית שלך נשמרה בהצלחה בליגה! 🎉');
      setActiveTab('league');
    } catch (err: any) {
      console.error('Submit prediction error:', err);
      showToast(err.message || 'שגיאה בשמירת התחזית לליגה');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create new league
  const handleCreateLeague = async (
    name: string,
    creatorName: string,
    description?: string,
    targetSurveyId?: string
  ) => {
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        creatorName,
        description,
        targetSurveyId,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'נכשלה יצירת הליגה');
    }

    setCurrentLeague(data.league);
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
      const res = await fetch(`/api/leagues/${leagueId}`);
      const data = await res.json();
      if (!res.ok || !data.league) {
        showToast('לא נמצאה ליגה עם קוד זה. בדוק את הקוד ונסה שוב.');
        return;
      }

      setCurrentLeague(data.league);
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
    const shareUrl = `${window.location.origin}${window.location.pathname}?league=${currentLeague.id}`;

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

  // When a new survey is scanned via AI
  const handleNewSurveyScanned = (newSurvey: Survey) => {
    setAllSurveys((prev) => [newSurvey, ...prev.filter((s) => s.id !== newSurvey.id)]);
    setSelectedSurveyId(newSurvey.id);
    showToast(`הסקר "${newSurvey.title}" פוענח בהצלחה ונוסף לרשימת הסקרים!`);
  };

  const username = localStorage.getItem('knesset_fantasy_username') || '';
  const userPrediction = currentLeague?.members.find(
    (m) => m.memberName.toLowerCase() === username.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 border border-slate-700 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
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
      <main className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 ${activeTab === 'picker' ? 'pt-6 sm:pt-8 pb-0' : 'py-6 sm:py-8'}`}>
        {activeTab === 'picker' && (
          <SeatPicker
            currentSeats={userSeats}
            onSeatsChange={setUserSeats}
            onSubmitPrediction={handleSubmitPrediction}
            isSubmitting={isSubmitting}
            activeLeagueName={currentLeague?.name}
            onNavigateToSurveys={() => setActiveTab('surveys')}
          />
        )}

        {activeTab === 'league' && (
          currentLeague ? (
            <LeagueView
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
              <p className="text-slate-500 text-sm mb-4">טוען נתוני ליגה...</p>
            </div>
          )
        )}

        {activeTab === 'scanner' && (
          <PhotoScanner
            userSeats={userSeats}
            onNewSurveyScanned={handleNewSurveyScanned}
            onNavigateToPicker={() => setActiveTab('picker')}
          />
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
              <span>סריקת סקרים עם Gemini AI</span>
              <span>•</span>
              <span>סקר כאן חדשות (מכון קאנטאר)</span>
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
