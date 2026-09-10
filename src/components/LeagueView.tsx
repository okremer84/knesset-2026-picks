import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Share2,
  Copy,
  Check,
  Users,
  Sparkles,
  ChevronDown,
  Award,
  Eye,
  MessageCircle,
  Lock,
  Unlock,
  Clock,
  AlertCircle,
  Plus,
  Send,
  Radio,
  UserCheck,
  UserX,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { League, Prediction, Survey, ElectionStage, UnsubmittedPlayer } from '../types';
import { calculateScore } from '../utils/scoring';
import { PARTIES_LIST } from '../data/parties';

interface LeagueViewProps {
  league: League;
  allSurveys: Survey[];
  selectedSurveyId: string;
  onSelectSurveyId: (id: string) => void;
  onOpenCreateLeague: () => void;
  onJoinExistingLeagueById: (id: string) => void;
  onNavigateToPicker: () => void;
  userPrediction?: Prediction;
  currentUserName?: string;
  onLeagueUpdate?: (updatedLeague: League) => void;
}

export const LeagueView: React.FC<LeagueViewProps> = ({
  league,
  allSurveys,
  selectedSurveyId,
  onSelectSurveyId,
  onOpenCreateLeague,
  onJoinExistingLeagueById,
  onNavigateToPicker,
  userPrediction,
  currentUserName,
  onLeagueUpdate,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [inspectingMember, setInspectingMember] = useState<Prediction | null>(null);
  const [sealedInspectMember, setSealedInspectMember] = useState<{ name: string; submittedAt?: string } | null>(null);
  const [searchLeagueId, setSearchLeagueId] = useState('');

  // Election stage state (default: voting_open)
  const [electionStage, setElectionStage] = useState<ElectionStage>(league.electionStage || 'voting_open');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  // Sync state if league updates externally
  useEffect(() => {
    if (league.electionStage && league.electionStage !== electionStage) {
      setElectionStage(league.electionStage);
    }
  }, [league.electionStage]);

  // Handle stage switch
  const handleStageChange = async (newStage: ElectionStage) => {
    // Auto switch benchmark survey if switching to exit_poll or final_results
    let targetSurvey = selectedSurveyId;
    if (newStage === 'exit_poll') {
      const exitSurvey = allSurveys.find((s) => s.kind === 'exit_poll');
      if (!exitSurvey) { alert('טרם פורסם מדגם קלפיות מאומת'); return; }
      targetSurvey = exitSurvey.id;
      onSelectSurveyId(targetSurvey);
    } else if (newStage === 'final_results') {
      const officialSurvey =
        allSurveys.find((s) => s.kind === 'official_results');
      if (!officialSurvey) { alert('טרם פורסמו תוצאות רשמיות מאומתות'); return; }
      targetSurvey = officialSurvey.id;
      onSelectSurveyId(targetSurvey);
    }

    try {
      const res = await fetch(`/api/leagues/${league.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage, targetSurveyId: targetSurvey }),
      });
      if (res.ok) {
        setElectionStage(newStage);
        const data = await res.json();
        if (data.league && onLeagueUpdate) {
          onLeagueUpdate(data.league);
        }
      }
    } catch (err) {
      console.error('Failed to sync stage to server:', err);
    }
  };

  // Add friend/player to league roster
  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim() || isAddingPlayer) return;

    setIsAddingPlayer(true);
    try {
      const res = await fetch(`/api/leagues/${league.id}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlayerName.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.league) {
        if (onLeagueUpdate) {
          onLeagueUpdate(data.league);
        }
        setNewPlayerName('');
      } else {
        alert(data.error || 'שגיאה בהוספת שחקן');
      }
    } catch (err) {
      alert('שגיאה בהתחברות לשרת');
    } finally {
      setIsAddingPlayer(false);
    }
  };

  // Active benchmark survey
  const currentSurvey = allSurveys.find((s) => s.id === selectedSurveyId) || allSurveys[0];

  // Calculate scores for submitted members
  const scoredMembers = league.members.map((member) => {
    const scoreResult = calculateScore(member.seats, currentSurvey.seats);
    return {
      member,
      scoreResult,
    };
  });

  // Sort by total score descending
  scoredMembers.sort((a, b) => b.scoreResult.totalScore - a.scoreResult.totalScore);

  // Unsubmitted players
  const unsubmittedPlayers: UnsubmittedPlayer[] = league.unsubmittedPlayers || [];

  // Total players count
  const totalPlayersCount = league.members.length + unsubmittedPlayers.length;
  const submittedCount = league.members.length;
  const pendingCount = unsubmittedPlayers.length;
  const completionPercentage = totalPlayersCount > 0 ? Math.round((submittedCount / totalPlayersCount) * 100) : 0;

  const shareUrl = `${window.location.origin}${window.location.pathname}?league=${league.id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(league.id);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `הצטרפו לליגת הבחירות שלי לכנסת בפנטזי בחירות: "${league.name}"! 🇮🇱\nמי יקלע הכי קרוב לחלוקת 120 המנדטים?\nלהצטרפות דרך הקישור:\n${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleWhatsAppReminder = (playerName: string) => {
    const text = encodeURIComponent(
      `היי ${playerName}, תזכורת חמה! עדיין לא הגשת את ניחוש 120 המנדטים שלך לליגת הבחירות "${league.name}"! 🗳️\nהקלפיות ייסגרו בקרוב והמעטפות יינעלו.\nהיכנס עכשיו להגיש את התחזית שלך:\n${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const currentUsernameLower = (currentUserName || '').toLowerCase().trim();

  return (
    <div className="space-y-6 bg-white text-slate-900 pb-12">
      {/* League Header & Invite Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-[#e62b1e] border border-red-200 text-xs font-bold">
                קוד ליגה: {league.id}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                נוצרה ע"י {league.creatorName}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1.5 flex items-center gap-2.5">
              <Trophy className="w-7 h-7 text-amber-500 shrink-0" />
              {league.name}
            </h2>

            {league.description && (
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                {league.description}
              </p>
            )}

            <div className="flex items-center gap-4 mt-3 text-xs text-slate-600 flex-wrap">
              <span className="flex items-center gap-1.5 font-bold text-slate-800">
                <Users className="w-4 h-4 text-slate-500" />
                {totalPlayersCount} שחקנים רשומים
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                {submittedCount} הגישו תחזית
              </span>
              {pendingCount > 0 && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-1.5 text-amber-700 font-bold">
                    <Clock className="w-4 h-4 text-amber-600" />
                    {pendingCount} טרם הגישו
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Share Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              onClick={handleWhatsAppShare}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              שתף בוואטסאפ
            </button>

            <button
              onClick={handleCopyLink}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-colors border border-slate-300 cursor-pointer shadow-sm"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copiedLink ? 'הקישור הועתק!' : 'העתק קישור להזמנה'}
            </button>

            <button
              onClick={handleCopyCode}
              className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-slate-300 cursor-pointer shadow-sm"
              title="העתק קוד ליגה"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              קוד
            </button>
          </div>
        </div>

        {/* Quick Join another League or Create */}
        <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="font-medium">מעבר לליגה אחרת:</span>
            <input
              type="text"
              placeholder="הזן קוד ליגה (למשל knesset-26)"
              value={searchLeagueId}
              onChange={(e) => setSearchLeagueId(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <button
              onClick={() => {
                if (searchLeagueId.trim()) {
                  onJoinExistingLeagueById(searchLeagueId.trim());
                  setSearchLeagueId('');
                }
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold cursor-pointer"
            >
              עבור
            </button>
          </div>

          <button
            onClick={onOpenCreateLeague}
            className="text-[#e62b1e] hover:text-red-700 font-bold underline underline-offset-4 cursor-pointer self-start sm:self-auto"
          >
            + פתיחת ליגה חדשה לחברים
          </button>
        </div>
      </div>

      {/* Interactive Election Timeline & Stage Switcher */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                ציר הזמן ומצב הבחירות בליגה
              </span>
            </div>
            <h3 className="text-lg font-black text-white mt-1">
              שלבי הבחירות: מתי נחשפים הניחושים?
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              הניחושים חסויים עד לסגירת הקלפיות. השתמש בלחצנים כדי להחליף שלב או לצפות בסימולציית החשיפה:
            </p>
          </div>

          {/* Quick simulation pills */}
          <div className="flex items-center gap-2 self-start md:self-auto bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => handleStageChange('voting_open')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                electionStage === 'voting_open'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>1. קלפיות פתוחות (סודי)</span>
            </button>

            <button
              type="button"
              onClick={() => handleStageChange('exit_poll')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                electionStage === 'exit_poll'
                  ? 'bg-sky-500 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>2. מדגם 22:00 (חשיפה ראשונה)</span>
            </button>

            <button
              type="button"
              onClick={() => handleStageChange('final_results')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                electionStage === 'final_results'
                  ? 'bg-[#e62b1e] text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>3. תוצאות אמת (חשיפה סופית)</span>
            </button>
          </div>
        </div>

        {/* Current Active Stage Status Explanation */}
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          {electionStage === 'voting_open' && (
            <div className="flex items-start sm:items-center gap-2.5 text-amber-300 bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl w-full">
              <Lock className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-white block sm:inline">
                  שלב 1 פעיל: שלב הניחושים פתוח והמעטפות חתומות 🔒
                </span>
                <span className="text-amber-200/90 block sm:inline sm:mr-2">
                  אף שחקן אינו יכול לראות את בחירות החברים! מוצג מי הגיש ומי טרם הגיש. החשיפה תתבצע ביום התוצאות.
                </span>
              </div>
            </div>
          )}

          {electionStage === 'exit_poll' && (
            <div className="flex items-start sm:items-center gap-2.5 text-sky-300 bg-sky-950/40 border border-sky-800/60 p-3 rounded-xl w-full">
              <Radio className="w-5 h-5 text-sky-400 shrink-0" />
              <div>
                <span className="font-bold text-white block sm:inline">
                  שלב 2 פעיל: 22:00 סגירת הקלפיות ומדגם הטלוויזיה 📺
                </span>
                <span className="text-sky-200/90 block sm:inline sm:mr-2">
                  הקלפיות ננעלו! כל הניחושים נחשפים לראשונה ומשווים למדגם הקלפיות של ערוצי הטלוויזיה, עד להכרזת תוצאות האמת.
                </span>
              </div>
            </div>
          )}

          {electionStage === 'final_results' && (
            <div className="flex items-start sm:items-center gap-2.5 text-red-300 bg-red-950/40 border border-red-800/60 p-3 rounded-xl w-full">
              <Award className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <span className="font-bold text-white block sm:inline">
                  שלב 3 פעיל: תוצאות האמת הסופיות והכרזת המנצח 🏆
                </span>
                <span className="text-red-200/90 block sm:inline sm:mr-2">
                  ספירת הקולות הסתיימה! חשיפה סופית והכתרת אלוף הפנטזי הרשמי של הכנסת ה-26.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Player & Progress Bar Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-700" />
              שחקני הליגה וסטטוס הגשה ({submittedCount}/{totalPlayersCount} הגישו)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              רואים מי כבר נעל את המעטפה עם 120 מנדטים ומי עדיין ממתין להגשה:
            </p>
          </div>

          {/* Quick Add Player Form */}
          <form onSubmit={handleAddPlayer} className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              placeholder="שם חבר/ה להוספה לרשימה"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 w-full sm:w-56"
            />
            <button
              type="submit"
              disabled={!newPlayerName.trim() || isAddingPlayer}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
                newPlayerName.trim() && !isAddingPlayer
                  ? 'bg-slate-900 hover:bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>הוסף שחקן</span>
            </button>
          </form>
        </div>

        {/* Progress Bar of Submissions */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-600">
              {submittedCount} מתוך {totalPlayersCount} שחקנים נעלו מעטפת ניחוש
            </span>
            <span className="text-[#e62b1e]">{completionPercentage}% הושלם</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
            <div
              className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: VOTING OPEN (SECRET MODE - PICKS CONCEALED IN SEALED ENVELOPES)   */}
      {/* ========================================================================= */}
      {electionStage === 'voting_open' ? (
        <div className="space-y-6">
          {/* Sealed Envelopes Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">
                    רשימת השחקנים והמעטפות החתומות
                  </h3>
                  <span className="text-xs text-slate-500">
                    הניחושים חבויים עד ליום התוצאות – כל שחקן יכול לצפות רק בניחוש של עצמו
                  </span>
                </div>
              </div>

              <button
                onClick={onNavigateToPicker}
                className="px-4 py-2 rounded-xl bg-[#e62b1e] hover:bg-[#c92318] text-white text-xs font-bold transition-colors cursor-pointer shadow-sm self-start sm:self-auto"
              >
                {userPrediction ? 'ערוך את הניחוש האישי שלך' : 'הגש את הניחוש שלך'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">שם השחקן</th>
                    <th className="py-3 px-4 text-center">סטטוס הגשה</th>
                    <th className="py-3 px-4 text-center">מעטפת בחירות</th>
                    <th className="py-3 px-4 text-center">מועד הגשה / עדכון</th>
                    <th className="py-3 px-4 text-center">פירוט מנדטים</th>
                    <th className="py-3 px-4 text-center">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Submitted Members */}
                  {league.members.map((member, idx) => {
                    const isCurrentUser =
                      member.memberName.toLowerCase().trim() === currentUsernameLower ||
                      (userPrediction && userPrediction.id === member.id);

                    return (
                      <tr
                        key={member.id}
                        className={`transition-colors ${
                          isCurrentUser ? 'bg-amber-50/40 hover:bg-amber-50/70 font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-4 px-4 text-center font-bold text-slate-400">
                          {idx + 1}
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {member.memberName}
                            </span>
                            {isCurrentUser && (
                              <span className="px-2 py-0.5 rounded-md bg-[#e62b1e] text-white text-[10px] font-black">
                                אתה
                              </span>
                            )}
                          </div>
                          {member.note && (
                            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 italic">
                              "{member.note}"
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
                            <UserCheck className="w-3.5 h-3.5" />
                            הגיש/ה תחזית (120/120)
                          </span>
                        </td>

                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900 text-white font-bold text-[11px] shadow-sm">
                            <Lock className="w-3 h-3 text-amber-400" />
                            מעטפה חתומה 🔒
                          </span>
                        </td>

                        <td className="py-4 px-4 text-center text-slate-500 font-medium">
                          {new Date(member.submittedAt).toLocaleDateString('he-IL', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        {/* Secret / Reveal Column */}
                        <td className="py-4 px-4 text-center">
                          {isCurrentUser ? (
                            <button
                              onClick={() => setInspectingMember(member)}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>הניחוש שלי (גלוי רק לך)</span>
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                setSealedInspectMember({
                                  name: member.memberName,
                                  submittedAt: member.submittedAt,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                              title="לחץ למידע על חיסיון הניחוש"
                            >
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                              <span>סודי עד יום התוצאות</span>
                            </button>
                          )}
                        </td>

                        <td className="py-4 px-4 text-center">
                          {isCurrentUser ? (
                            <button
                              onClick={onNavigateToPicker}
                              className="text-xs text-[#e62b1e] hover:text-red-700 font-bold underline cursor-pointer"
                            >
                              ערוך ניחוש
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">נצור במערכת</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Unsubmitted Players */}
                  {unsubmittedPlayers.map((player, idx) => {
                    const isCurrentUser =
                      player.name.toLowerCase().trim() === currentUsernameLower;

                    return (
                      <tr
                        key={player.id}
                        className="bg-slate-50/50 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-4 px-4 text-center font-bold text-slate-300">
                          {league.members.length + idx + 1}
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700 text-sm">
                              {player.name}
                            </span>
                            {isCurrentUser && (
                              <span className="px-2 py-0.5 rounded-md bg-[#e62b1e] text-white text-[10px] font-black">
                                אתה
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            הוזמן/ה לליגה • טרם מילא/ה 120 מנדטים
                          </div>
                        </td>

                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-xs">
                            <Clock className="w-3.5 h-3.5" />
                            טרם הגיש/ה תחזית
                          </span>
                        </td>

                        <td className="py-4 px-4 text-center">
                          <span className="text-slate-400 text-xs italic">
                            מעטפה ריקה
                          </span>
                        </td>

                        <td className="py-4 px-4 text-center text-slate-400">
                          —
                        </td>

                        <td className="py-4 px-4 text-center text-slate-400">
                          ממתין למילוי
                        </td>

                        <td className="py-4 px-4 text-center">
                          {isCurrentUser ? (
                            <button
                              onClick={onNavigateToPicker}
                              className="px-3 py-1 bg-[#e62b1e] hover:bg-[#c92318] text-white text-xs font-bold rounded-lg cursor-pointer shadow-sm"
                            >
                              הגש עכשיו!
                            </button>
                          ) : (
                            <button
                              onClick={() => handleWhatsAppReminder(player.name)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer"
                              title="שלח תזכורת בוואטסאפ"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>שלח תזכורת</span>
                            </button>
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
      ) : (
        /* ========================================================================= */
        /* VIEW 2 & 3: REVEALED LEADERBOARD (EXIT POLL 22:00 OR OFFICIAL RESULTS)     */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Benchmark Survey Selector */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {electionStage === 'exit_poll'
                    ? 'סקר המדגם שנבחר להשוואת התוצאות (סגירת קלפיות 22:00)'
                    : 'תוצאות האמת לחישוב הזוכים והניקוד'}
                </h3>
                <p className="text-xs text-slate-500">
                  {electionStage === 'exit_poll'
                    ? 'השוואה ראשונית מיד עם סגירת הקלפיות ב-22:00 מול מדגמי הטלוויזיה:'
                    : 'דירוג סופי רשמי לפי תוצאות האמת הסופיות:'}
                </p>
              </div>
            </div>

            <div className="relative min-w-[280px]">
              <select
                value={selectedSurveyId}
                onChange={(e) => onSelectSurveyId(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer pr-4 pl-9"
              >
                {allSurveys.map((survey) => (
                  <option key={survey.id} value={survey.id}>
                    {survey.title} ({survey.date})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Leaderboard Table (Revealed) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[#e62b1e]" />
                <h3 className="font-black text-slate-900 text-base">
                  {electionStage === 'exit_poll'
                    ? 'דירוג חברי הליגה לפי מדגם הטלוויזיה'
                    : 'טבלת אלופי הליגה לפי תוצאות האמת'}
                </h3>
                <span className="text-xs text-slate-500">
                  (מבוסס על: {currentSurvey.title})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black flex items-center gap-1.5">
                  <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                  כל הניחושים נחשפו!
                </span>
              </div>
            </div>

            {scoredMembers.length === 0 ? (
              <div className="p-12 text-center bg-slate-50">
                <Trophy className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h4 className="text-lg font-bold text-slate-800">
                  עדיין אין תחזיות שהוגשו בליגה זו
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                  היה הראשון לנחש את חלוקת 120 המנדטים, או שתף את הקישור עם החברים כדי להתחיל את התחרות!
                </p>
                <button
                  onClick={onNavigateToPicker}
                  className="px-6 py-2.5 rounded-xl bg-[#e62b1e] hover:bg-[#c92318] text-white text-xs font-black transition-colors shadow-sm cursor-pointer"
                >
                  הזן ניחוש ראשון
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">מקום</th>
                      <th className="py-3 px-4">משתתף</th>
                      <th className="py-3 px-4 text-center">ניקוד פנטזי</th>
                      <th className="py-3 px-4 text-center">אחוז דיוק</th>
                      <th className="py-3 px-4 text-center">בול פגיעה (מפלגות)</th>
                      <th className="py-3 px-4 text-center">גוש קואליציה</th>
                      <th className="py-3 px-4 text-center">תואר</th>
                      <th className="py-3 px-4 text-center">פירוט מנדטים</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scoredMembers.map(({ member, scoreResult }, index) => {
                      const isTop3 = index < 3;
                      const rankBadge =
                        index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;

                      const coalitionBloc = scoreResult.blocComparison.find(
                        (b) => b.bloc === 'coalition'
                      );

                      const isCurrentUser =
                        member.memberName.toLowerCase().trim() === currentUsernameLower;

                      return (
                        <tr
                          key={member.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            isCurrentUser ? 'bg-amber-50/40 font-medium' : ''
                          }`}
                        >
                          {/* Rank */}
                          <td className="py-4 px-4 text-center font-bold text-base">
                            {isTop3 ? (
                              <span className="text-xl">{rankBadge}</span>
                            ) : (
                              <span className="text-slate-500 font-bold">{rankBadge}</span>
                            )}
                          </td>

                          {/* Name & Note */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-sm">
                                {member.memberName}
                              </span>
                              {isCurrentUser && (
                                <span className="px-1.5 py-0.5 rounded bg-[#e62b1e] text-white text-[9px] font-black">
                                  אתה
                                </span>
                              )}
                            </div>
                            {member.note && (
                              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 italic">
                                "{member.note}"
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {new Date(member.submittedAt).toLocaleDateString('he-IL')}
                            </div>
                          </td>

                          {/* Score */}
                          <td className="py-4 px-4 text-center">
                            <span className="inline-block px-3 py-1 rounded-xl bg-red-50 border border-red-200 text-[#e62b1e] font-black text-base">
                              {scoreResult.totalScore}{' '}
                              <span className="text-[10px] font-normal text-slate-500">/ 120</span>
                            </span>
                          </td>

                          {/* Accuracy % */}
                          <td className="py-4 px-4 text-center font-bold text-slate-800">
                            {scoreResult.accuracyPercentage}%
                          </td>

                          {/* Exact Hits */}
                          <td className="py-4 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                              {scoreResult.exactHitsCount} מדויקות
                            </span>
                          </td>

                          {/* Coalition Bloc */}
                          <td className="py-4 px-4 text-center">
                            <div className="text-slate-800 font-bold">
                              {coalitionBloc?.predicted} מנדטים
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {coalitionBloc && coalitionBloc.diff === 0
                                ? 'פגיעה מושלמת'
                                : `פער של ${coalitionBloc?.diff} מנדטים`}
                            </div>
                          </td>

                          {/* Rank Badge */}
                          <td className="py-4 px-4 text-center">
                            <span className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                              {scoreResult.rankTitle}
                            </span>
                          </td>

                          {/* Actions: View Party Breakdown */}
                          <td className="py-4 px-4 text-center">
                            <button
                              onClick={() => setInspectingMember(member)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer border border-slate-200 font-bold inline-flex items-center gap-1"
                              title="צפה בפירוט המלא של התחזית"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>צפה</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Unsubmitted Players listed at bottom */}
            {unsubmittedPlayers.length > 0 && (
              <div className="p-4 bg-slate-50/70 border-t border-slate-200 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-bold mb-2">
                  <UserX className="w-4 h-4 text-slate-400" />
                  <span>שחקנים שנרשמו לליגה אך לא הגישו ניחוש לפני סגירת הקלפיות:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {unsubmittedPlayers.map((p) => (
                    <span
                      key={p.id}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 font-medium"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: FRIEND'S SEALED BALLOT INFO MODAL                               */}
      {/* ========================================================================= */}
      {sealedInspectMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-900 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>

            <div>
              <h4 className="text-xl font-black text-slate-900">
                מעטפת הניחוש חתומה ונצורה 🔒
              </h4>
              <p className="text-sm font-bold text-[#e62b1e] mt-1">
                התחזית של {sealedInspectMember.name}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 text-right space-y-2 leading-relaxed">
              <p>
                🗳️ <strong>מדוע הניחוש חסוי?</strong>
                <br />
                בפנטזי בחירות, חלוקת 120 המנדטים של החברים נשמרת בסוד מוחלט עד לסגירת הקלפיות, כדי למנוע העתקות ולהבטיח תחרות מותחת והוגנת!
              </p>
              <p>
                📺 <strong>מתי ייחשף הניחוש?</strong>
                <br />
                המעטפה תיפתח אוטומטית ברגע סגירת הקלפיות (במדגם ערוצי הטלוויזיה ב-22:00) וסופית עם פרסום תוצאות האמת.
              </p>
              {sealedInspectMember.submittedAt && (
                <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-200">
                  הוגש וננעל ב: {new Date(sealedInspectMember.submittedAt).toLocaleDateString('he-IL', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setSealedInspectMember(null);
                  handleStageChange('exit_poll');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                רוצה לראות הדגמה? עבור לשלב "מדגם 22:00"
              </button>
              <button
                type="button"
                onClick={() => setSealedInspectMember(null)}
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: MEMBER DETAILS BREAKDOWN MODAL (OWN PREDICTION OR REVEALED)      */}
      {/* ========================================================================= */}
      {inspectingMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  תחזית מלאה: {inspectingMember.memberName}
                </h4>
                <p className="text-xs text-slate-500">
                  השוואה מול: {currentSurvey.title}
                </p>
              </div>
              <button
                onClick={() => setInspectingMember(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer text-base font-bold"
              >
                ✕
              </button>
            </div>

            {/* Score Summary Banner */}
            {(() => {
              const res = calculateScore(inspectingMember.seats, currentSurvey.seats);
              return (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">ניקוד כולל לפי סקר זה</div>
                    <div className="text-2xl font-black text-[#e62b1e]">
                      {res.totalScore} / 120
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">פגיעות בול</div>
                    <div className="text-xl font-bold text-emerald-600">
                      {res.exactHitsCount} מפלגות
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">דירוג השגה</div>
                    <div className="text-sm font-bold text-slate-800">
                      {res.rankTitle}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Table of Party Comparison */}
            <div className="space-y-2">
              <h5 className="text-xs font-bold text-slate-700">
                חלוקת המנדטים לפי מפלגה:
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {PARTIES_LIST.map((party) => {
                  const pred = Number(inspectingMember.seats[party.id]) || 0;
                  const actual = Number(currentSurvey.seats[party.id]) || 0;
                  const diff = Math.abs(pred - actual);
                  const isExact = diff === 0 && (pred > 0 || actual > 0);

                  return (
                    <div
                      key={party.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between ${
                        isExact
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : diff <= 2
                          ? 'bg-slate-50 border-slate-200 text-slate-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-white text-[10px]"
                          style={{ backgroundColor: party.color }}
                        >
                          {party.ballotLetter}
                        </span>
                        <div>
                          <div className="font-bold">{party.name}</div>
                          <div className="text-[10px] text-slate-500">{party.leader}</div>
                        </div>
                      </div>

                      <div className="text-left">
                        <div className="font-bold text-slate-900">
                          ניחוש: {pred} | סקר: {actual}
                        </div>
                        <div className="text-[10px]">
                          {isExact ? (
                            <span className="text-emerald-600 font-bold">✓ בול פגיעה!</span>
                          ) : (
                            <span className="text-slate-500">הפרש: {diff} מנדטים</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-left pt-2">
              <button
                onClick={() => setInspectingMember(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-bold text-white cursor-pointer"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
