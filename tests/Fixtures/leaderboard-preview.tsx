import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LeagueView } from '../../src/components/LeagueView';
import feed from '../../data/election-results.json';
import type { League, Survey } from '../../src/types';
import '../../src/index.css';

const surveys = feed.surveys as Survey[];
const names = ['נועה', 'עומר', 'דנה', 'איתי'];
const league: League = {
  id: 'preview', name: 'ליגת ליל הבחירות', creatorName: 'עומר', isCommissioner: true,
  isLocked: true, locksAt: '2026-10-27T18:00:00Z', inviteCode: 'preview', predictionsHidden: false,
  submittedCount: surveys.length, totalPlayersCount: surveys.length, benchmarkSurvey: surveys[0], rankings: [],
  members: surveys.map((survey, i) => ({ id: `pick-${i}`, userId: i + 1, memberName: names[i], seats: survey.seats,
    turnoutPercentage: 70 + i * 0.5, submittedAt: '2026-10-26T12:00:00Z' })),
  scoringVersion: '1', createdAt: '2026-10-01',
};
function Preview() {
  const [selected, select] = useState(surveys[0].id);
  return <main style={{ maxWidth: 1200, margin: 'auto', padding: '24px 16px' }}>
    <p style={{ color: '#6b7067', fontSize: 13, marginBottom: 16 }}>תצוגה מקומית · משתתפים ותחזיות לדוגמה · <a href="/tests/Fixtures/results-preview.html">תוצאות המדגמים</a></p>
    <LeagueView league={league} allSurveys={surveys} selectedSurveyId={selected} onSelectSurveyId={select}
      currentUserId={2} onOpenCreateLeague={() => {}} onJoinExistingLeagueById={() => {}} onNavigateToPicker={() => {}}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
