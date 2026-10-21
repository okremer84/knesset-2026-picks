import React, { useState, useEffect, useRef } from 'react';
import { CampaignView } from './components/CampaignView';
import { Header } from './components/Header';
import { PickImport } from './components/PickImport';
import { SeatPicker } from './components/SeatPicker';
import { LeagueView } from './components/LeagueView';
import { apiFetch as fetch } from './lib/api';
import { useUser } from './components/AuthGate';
import { surveySyncNotice } from './utils/surveys';
import { initialLeagueId, loadInitialLeague, initialTab } from './lib/navigation';
import { readPreference, writePreference } from './lib/preferences';
import { createPredictionSync } from './lib/predictionSync';
import { reconcileDraft, reconcileDetails, predictionDetails, storedPredictionDetails, type PredictionDetails } from './utils/predictionDraft';
import { SurveyComparator } from './components/SurveyComparator';
import { HistoricalAnalysis } from './components/HistoricalAnalysis';
import { CreateLeagueModal } from './components/CreateLeagueModal';
import { DEFAULT_SURVEYS } from './data/surveys';
import { PARTIES_LIST, partiesForPick } from './data/parties';
import { League, LeagueSummary, Prediction, Survey, SavedPick } from './types';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const user = useUser();
  const [surveyNotice, setSurveyNotice] = useState('מציגים עותק שמור של הסקרים עד לקבלת עדכון מהשרת');
  const [joinCode, setJoinCode] = useState('');
  const [myLeagues, setMyLeagues] = useState<LeagueSummary[]>([]);
  const [activeTab, setActiveTab] = useState(() => { const tab = initialTab(new URLSearchParams(window.location.search), readPreference('knesset_fantasy_tab_' + user.id)); return tab === 'campaign' && !user.campaign_access ? 'picker' : tab; });
  const [allSurveys, setAllSurveys] = useState<Survey[]>(DEFAULT_SURVEYS);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>(DEFAULT_SURVEYS[0]?.id || '');
  const [currentLeague, setCurrentLeague] = useState<League | null>(null);
  const [switchingLeague, setSwitchingLeague] = useState(false);
  const [pendingLeagueId, setPendingLeagueId] = useState<string | null>(null);
  const editorOperation = useRef<'save' | 'switch' | null>(null);
  const [isCreateLeagueModalOpen, setIsCreateLeagueModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loadingLeague, setLoadingLeague] = useState(true);

  const [userPrediction, setUserPrediction] = useState<Prediction | undefined>();
  const [pickLocked, setPickLocked] = useState(true);
  const [savedPicks, setSavedPicks] = useState<SavedPick[]>([]);
  const importablePicks = savedPicks.filter(pick => pick.leagueId && pick.leagueId !== currentLeague?.id);
  const [picksStatus, setPicksStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [picksRetry, setPicksRetry] = useState(0);
  const [draftInitialized, setDraftInitialized] = useState(false);
  const predictionSync = useRef(createPredictionSync());
  useEffect(() => {
    if (loadingLeague) return;
    if (!currentLeague) { setSavedPicks([]); setPickLocked(false); setPicksStatus('ready'); return; }
    const controller = new AbortController();
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || editorOperation.current) return;
      refreshing = true;
      await predictionSync.current.refresh(async () => {
        const response = await fetch('/api/my-picks' + (currentLeague ? '?leagueId=' + encodeURIComponent(currentLeague.id) : ''), { signal: controller.signal });
        if (!response.ok) throw new Error('Failed to load pick');
        return response.json();
      }, data => {
        if (!controller.signal.aborted && !editorOperation.current) {
          setSavedPicks(data.picks); setUserPrediction(data.pick ?? undefined);
          setPickLocked(data.isLocked); setPicksStatus('ready');
        }
      }, () => { if (!controller.signal.aborted && !editorOperation.current) setPicksStatus('error'); });
      refreshing = false;
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [currentLeague?.id, picksRetry, loadingLeague]);

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

  const hasStoredDraft = useRef(false);
  const previousSubmittedSeats = useRef<Record<string, number> | undefined>(undefined);
  const previousSubmittedDetails = useRef<PredictionDetails | undefined>(undefined);
  const [draftDetails, setDraftDetails] = useState(() => storedPredictionDetails(readPreference('knesset_fantasy_draft_details_' + user.id + (currentLeague ? '_' + currentLeague.id : ''))));
  useEffect(() => {
    if (!currentLeague || loadingLeague || !draftInitialized) return;
    if (draftDetails) writePreference('knesset_fantasy_draft_details_' + user.id + (currentLeague ? '_' + currentLeague.id : ''), draftDetails);
  }, [draftDetails, user.id, currentLeague?.id, loadingLeague, picksStatus, draftInitialized]);

  // User's current draft seats (starts empty by default, strictly sanitized)
  const [userSeats, setUserSeats] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('knesset_fantasy_user_seats_' + user.id + (currentLeague ? '_' + currentLeague.id : ''));
      if (saved) {
        const parsed = JSON.parse(saved);
        hasStoredDraft.current = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
        return sanitizeSeatsMap(parsed);
      }
    } catch {
      // Fallback
    }
    // Start empty by default as requested
    return {};
  });

  // Persist only a hydrated draft, never the temporary startup placeholders.
  useEffect(() => {
    if (!currentLeague || loadingLeague || !draftInitialized) return;
    try {
      localStorage.setItem('knesset_fantasy_user_seats_' + user.id + (currentLeague ? '_' + currentLeague.id : ''), JSON.stringify(userSeats));
    } catch {
      // Ignore
    }
  }, [userSeats, currentLeague?.id, loadingLeague, picksStatus, draftInitialized]);

  const leagueDrafts = useRef(new Map<string, {
    seats: Record<string, number>;
    details: PredictionDetails;
    submittedSeats: Record<string, number>;
    submittedDetails: PredictionDetails;
  }>());

  // Fetch the complete destination before replacing the visible editor.
  const selectLeague = async (league: League | null) => {
    const response = await fetch('/api/my-picks' + (league ? '?leagueId=' + encodeURIComponent(league.id) : ''));
    if (!response.ok) throw new Error('לא ניתן לטעון את התחזית');
    const data = await response.json();
    const pick: Prediction | undefined = data.pick ?? undefined;
    const suffix = user.id + (league ? '_' + league.id : '');
    const cached = league ? leagueDrafts.current.get(league.id) : undefined;
    const storedSeats = cached?.seats ?? readPreference('knesset_fantasy_user_seats_' + suffix);
    hasStoredDraft.current = storedSeats !== null && typeof storedSeats === 'object' && !Array.isArray(storedSeats);
    previousSubmittedSeats.current = pick?.seats;
    previousSubmittedDetails.current = predictionDetails(pick);
    setUserSeats(cached
      ? reconcileDraft(cached.seats, cached.submittedSeats, pick?.seats ?? {}, true)
      : sanitizeSeatsMap(hasStoredDraft.current ? storedSeats : pick?.seats));
    setDraftDetails(cached
      ? reconcileDetails(cached.details, cached.submittedDetails, predictionDetails(pick))
      : storedPredictionDetails(readPreference('knesset_fantasy_draft_details_' + suffix)) ?? predictionDetails(pick));
    setDraftInitialized(true);
    setUserPrediction(pick);
    setSavedPicks(data.picks);
    setPickLocked(data.isLocked);
    setPicksStatus('ready');
    setCurrentLeague(league);
  };

  // All changes of destination and submissions share one synchronous guard.
  const changeEditor = async (id: string | null, load: () => Promise<League | null>) => {
    if (editorOperation.current) throw new Error('יש להמתין לסיום הפעולה הנוכחית');
    if (currentLeague && draftInitialized) {
      leagueDrafts.current.set(currentLeague.id, {
        seats: { ...userSeats },
        details: { ...(draftDetails ?? predictionDetails(userPrediction)) },
        submittedSeats: { ...userPrediction?.seats },
        submittedDetails: predictionDetails(userPrediction),
      });
    }
    editorOperation.current = 'switch';
    predictionSync.current.beginOperation();
    setSwitchingLeague(true);
    setPendingLeagueId(id);
    try {
      const league = await load();
      await selectLeague(league);
      return league;
    } finally {
      predictionSync.current.endOperation();
      editorOperation.current = null;
      setSwitchingLeague(false);
      setPendingLeagueId(null);
    }
  };

  // Load surveys from backend
  useEffect(() => {
    fetch('/api/surveys')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.surveys)) {
          setAllSurveys(data.surveys);
          setSurveyNotice(surveySyncNotice(data.surveys.length, data.sync));
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

  // Load small membership summaries, then fetch only the selected league's details.
  useEffect(() => {
    let cancelled = false;
    async function loadLeagues() {
      try {
        const res = await fetch('/api/leagues');
        if (!res.ok) throw new Error('לא ניתן לטעון את הליגות');
        const data: { leagues: LeagueSummary[] } = await res.json();
        if (cancelled) return;
        setMyLeagues(data.leagues);
        const params = new URLSearchParams(window.location.search);
        const id = await initialLeagueId(params, data.leagues, handleJoinExistingLeagueById);
        if (cancelled) return;
        if (!id) return;
        const response = await loadInitialLeague(id, data.leagues, leagueId => fetch('/api/leagues/' + encodeURIComponent(leagueId)));
        if (!response.ok) throw new Error('לא ניתן לפתוח את הליגה');
        const detail: { league: League } = await response.json();
        if (cancelled) return;
        await selectLeague(detail.league);
        if (detail.league.targetSurveyId) setSelectedSurveyId(detail.league.targetSurveyId);
      } catch (e) {
        if (!cancelled) showToast((e as Error).message, 'error');
      } finally {
        if (!cancelled) setLoadingLeague(false);
      }
    }
    loadLeagues();
    return () => { cancelled = true; };
  }, []);

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

  // A failed league refresh must not change the outcome of an already saved pick.
  const refreshLeagueAfterSave = async (leagueId: string) => {
    try {
      const response = await fetch('/api/leagues/' + encodeURIComponent(leagueId));
      if (!response.ok) return;
      const data = await response.json();
      if (data.league?.id === leagueId) {
        setCurrentLeague(selected => selected?.id === leagueId ? data.league : selected);
      }
    } catch {
      // Keep the last successful league state; the regular refresh will retry.
    }
  };

  // Submit only to the selected league.
  const handleSubmitPrediction = async (pickName: string, note?: string, turnoutPercentage?: number) => {

    if (!currentLeague) throw new Error('יש לבחור ליגה לפני הגשת תחזית');
    if (pickLocked) throw new Error('מועד ההגשה הסתיים. הבחירה לא נשמרה.');
    if (editorOperation.current || loadingLeague || switchingLeague || isSubmitting || picksStatus !== 'ready') {
      throw new Error('לא ניתן לשמור כרגע. נסו שוב לאחר טעינת התחזית.');
    }

    // Always sanitize to strictly PARTIES_LIST keys with integer values
    const cleanSeats: Record<string, number> = {};
    let totalAllocated = 0;
    partiesForPick(userPrediction?.seats).forEach((p) => {
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

    editorOperation.current = 'save';
    predictionSync.current.beginOperation();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/my-pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueId: currentLeague?.id,
          pickName,
          seats: cleanSeats,
          note,
          turnoutPercentage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'שגיאה בשמירת התחזית');
      }

      setUserPrediction(data.pick); setSavedPicks(data.picks); setPickLocked(data.isLocked); setPicksStatus('ready');
      setDraftDetails(predictionDetails(data.pick));
      showToast('התחזית שלך נשמרה בהצלחה', 'success');
      if (currentLeague) {
        setActiveTab('league');
        void refreshLeagueAfterSave(currentLeague.id);
      }
    } catch (err: any) {
      console.error('Submit prediction error:', err);
      showToast(err.message || 'שגיאה בשמירת התחזית', 'error');
      throw err;
    } finally {
      editorOperation.current = null;
      predictionSync.current.endOperation();
      setIsSubmitting(false);
    }
  };

  const handleSwitchLeague = async (leagueId: string) => {
    if (!leagueId || loadingLeague || editorOperation.current || leagueId === (currentLeague?.id ?? '')) return;
    try {
      await changeEditor(leagueId, async () => {
        const response = await fetch('/api/leagues/' + encodeURIComponent(leagueId));
        const data = await response.json();
        if (!response.ok || data.league?.id !== leagueId) throw new Error(data.message || 'לא ניתן לטעון את הליגה');
        return data.league;
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'לא ניתן לטעון את הליגה', 'error');
    }
  };

  const handleCreateLeague = async (
    name: string,
    creatorName: string,
    description?: string,
    targetSurveyId?: string,
    locksAt?: string
  ) => {
    let createdSuccessfully = false;
    try {
      const league = await changeEditor(null, async () => {
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

        if (!data.league || typeof data.league.id !== 'string' || typeof data.league.name !== 'string' || !Array.isArray(data.league.members)) {
          throw new Error('השרת לא החזיר ליגה תקינה. נסו שוב.');
        }

        // The POST has committed: record it before the separate editor read.
        const created: League = data.league;
        createdSuccessfully = true;
        setMyLeagues(prev => [created, ...prev.filter(l => l.id !== created.id)]);
        return created;
      });
      if (!league) return;
      if (league.targetSurveyId) {
        setSelectedSurveyId(league.targetSurveyId);
      }

      showToast(`ליגת "${league.name}" נוצרה בהצלחה! שתף את הקישור עם החברים.`);
      setActiveTab('league');
    } catch (error) {
      if (!createdSuccessfully) throw error;
      // Resolving closes the create form. Retrying via the dropdown only reads.
      showToast(`ליגת "${name}" נוצרה, אך לא ניתן לפתוח אותה כרגע. בחרו אותה ברשימת הליגות כדי לנסות שוב.`, 'info');
    }
  };

  // Switch / Join league by ID
  const handleJoinExistingLeagueById = async (leagueId: string) => {
    let joinedSuccessfully = false;
    try {
      const league = await changeEditor(null, async () => {
        const res = await fetch('/api/leagues/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({code: leagueId}) });
        const data = await res.json();
        if (!res.ok || !data.league) {
          const validation = Object.values(data.errors || {}).flat().join(' ');
          throw new Error(validation || data.message || data.error || 'לא נמצאה ליגה עם קוד זה.');
        }
        const joined: League = data.league;
        joinedSuccessfully = true;
        setMyLeagues(prev => [joined, ...prev.filter(l => l.id !== joined.id)]);
        return joined;
      });
      if (!league) return false;
      showToast(`עברת בהצלחה לליגת "${league.name}"!`);
      setActiveTab('league');
      return true;
    } catch (err) {
      if (joinedSuccessfully) {
        showToast('ההצטרפות הצליחה, אך לא ניתן לפתוח את הליגה כרגע. בחרו אותה ברשימת הליגות כדי לנסות שוב.', 'info');
        return true;
      }
      showToast(err instanceof Error ? err.message : 'שגיאה בטעינת הליגה', 'error');
      return false;
    }
  };

  const username = user.name;
  useEffect(() => {
    if (loadingLeague || picksStatus !== 'ready') return;
    setDraftInitialized(true);
    if (!userPrediction) return;
    const previous = previousSubmittedSeats.current;
    const stored = hasStoredDraft.current;
    setUserSeats(draft => reconcileDraft(draft, previous, userPrediction.seats, stored));
    previousSubmittedSeats.current = userPrediction.seats;
    const details = predictionDetails(userPrediction);
    const previousDetails = previousSubmittedDetails.current;
    setDraftDetails(draft => reconcileDetails(draft, previousDetails, details));
    previousSubmittedDetails.current = details;
  }, [userPrediction?.id, userPrediction?.submittedAt, loadingLeague, picksStatus]);

  useEffect(() => {
    writePreference('knesset_fantasy_tab_' + user.id, activeTab);
    if (loadingLeague) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    url.searchParams.set('tab', activeTab);
    if (activeTab !== 'campaign') url.searchParams.delete('view');
    if (activeTab !== 'campaign' && currentLeague) url.searchParams.set('league', currentLeague.id);
    else url.searchParams.delete('league');
    window.history.replaceState({}, '', url);
  }, [activeTab, currentLeague?.id, loadingLeague, user.id]);

  // Refresh deadlines, standings and invitations without trusting the browser clock.
  useEffect(() => {
    if (!currentLeague) return;
    const leagueId = currentLeague.id;
    const controller = new AbortController();
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || controller.signal.aborted) return;
      refreshing = true;
      try {
        const response = await fetch('/api/leagues/' + encodeURIComponent(leagueId), { signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (data?.league?.id === leagueId && !controller.signal.aborted) {
          setCurrentLeague(selected =>
            !controller.signal.aborted && selected?.id === leagueId ? data.league : selected);
        }
      } catch {
        // Keep the last successful state after cancellation or a failed refresh.
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(refresh, 30000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [currentLeague?.id]);

  return (
    <div dir="rtl" className={`app-shell ${activeTab === 'picker' ? 'picks-surface' : activeTab === 'campaign' ? 'campaign-surface' : ''}`}>
      
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
      />

      {/* Main Content Area */}
      {surveyNotice && activeTab !== 'campaign' && <p role="status" className="max-w-7xl mx-auto w-full px-6 pt-4 text-sm text-amber-800">{surveyNotice}</p>}
      {(activeTab === 'league' || activeTab === 'picker') && myLeagues.length > 0 && <label className="max-w-7xl mx-auto w-full px-6 pt-4 text-sm">בחירה לליגה: <select value={pendingLeagueId ?? currentLeague?.id ?? ''} disabled={loadingLeague || switchingLeague || isSubmitting} onChange={e => { void handleSwitchLeague(e.target.value); }} className="border rounded-lg p-2">{!currentLeague && <option value="" disabled>בחירת ליגה</option>}{myLeagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      {pickLocked && picksStatus === 'ready' && activeTab === 'picker' && <p className="max-w-7xl mx-auto w-full px-6 pt-4 text-amber-800">התחזית שלך נעולה.</p>}
      <main id="main-content" tabIndex={-1} className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 ${activeTab === 'picker' ? 'pt-6 sm:pt-8 pb-0' : 'py-6 sm:py-8'}`}>
        {activeTab === 'picker' && picksStatus === 'error' && <p role="alert">לא ניתן לטעון את התחזית. <button onClick={() => { setPicksStatus('loading'); setPicksRetry(n => n + 1); }}>ניסיון נוסף</button></p>}
        {activeTab === 'picker' && currentLeague && (
          <SeatPicker
            key={currentLeague?.id ?? 'personal'}
            importAction={picksStatus === 'ready' && !pickLocked ? (
              <PickImport key={currentLeague?.id ?? 'personal'}
            importablePicks={importablePicks}
            onImportPick={source => {
              hasStoredDraft.current = true;
              setUserSeats(sanitizeSeatsMap(source.seats));
              setDraftDetails({ pickName: source.pickName || '', note: source.note || '', turnoutPercentage: String(source.turnoutPercentage ?? '') });
              showToast('הבחירה הועתקה לטיוטה. ניתן לערוך אותה לפני ההגשה.', 'info');
            }}
          disabled={loadingLeague || switchingLeague || isSubmitting}
        />
            ) : null}
            currentSeats={userSeats}
            details={draftDetails ?? predictionDetails(userPrediction)}
            onDetailsChange={setDraftDetails}
            onSeatsChange={seats => { hasStoredDraft.current = true; setUserSeats(seats); }}
            onSubmitPrediction={handleSubmitPrediction}
            isSubmitting={isSubmitting}
            prediction={userPrediction}
            isLocked={pickLocked}
            isSwitching={switchingLeague}
            isLoading={loadingLeague || picksStatus === 'loading'}
            hasLoadError={picksStatus === 'error'}
          />
        )}

        {(activeTab === 'league' || (activeTab === 'picker' && !currentLeague)) && (
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
              currentUserId={user.id}
            />
          ) : (
            <div className="empty-leagues">
              <h1 className="text-3xl font-bold mb-3">הליגות שלי</h1><p className="text-slate-500 text-sm mb-6">{loadingLeague ? 'טוען נתוני ליגה…' : 'עדיין לא הצטרפת לליגה'}</p>
              {!loadingLeague && <div className="space-y-4">
                <button className="button-primary" onClick={() => setIsCreateLeagueModalOpen(true)}>יצירת ליגה</button>
                <form onSubmit={e => { e.preventDefault(); handleJoinExistingLeagueById(joinCode.trim()); }} className="flex gap-2 justify-center flex-wrap"><input aria-label="קוד הזמנה" className="border rounded-xl p-2" value={joinCode} onChange={e => setJoinCode(e.target.value)} required placeholder="קוד הזמנה"/><button className="border rounded-xl p-2">הצטרפות לליגה</button></form>
              </div>}
            </div>
          )
        )}



        {activeTab === 'surveys' && (
          <SurveyComparator
            surveys={allSurveys}
            picks={picksStatus === 'ready' ? savedPicks.filter(pick => pick.leagueId) : []}
            picksStatus={picksStatus}
            onRetryPicks={() => setPicksRetry(n => n + 1)}
          />
        )}

        {activeTab === 'campaign' && user.campaign_access && <CampaignView userId={user.id} initialLeagueId={currentLeague?.id}/>}

        {activeTab === 'historical' && (
          <HistoricalAnalysis/>
        )}
      </main>


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
