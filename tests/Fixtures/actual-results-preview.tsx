import React from 'react';
import { createRoot } from 'react-dom/client';
import { ResultsView } from '../../src/components/ResultsView';
import { LeagueView } from '../../src/components/LeagueView';
import type { League, Survey } from '../../src/types';
import feed from '../../data/actual-results.json';
import '../../src/index.css';

const results = feed.surveys as Survey[];
const result = results[0];
const league: League = {
  id: 'preview', name: 'ליגת ליל הבחירות', creatorName: 'תצוגה מקומית', createdAt: '2026-10-01',
  isCommissioner: false, isLocked: true, locksAt: '2026-10-27T18:00:00Z', inviteCode: 'preview',
  predictionsHidden: false, submittedCount: 3, totalPlayersCount: 3, benchmarkSurvey: result,
  rankings: [], scoringVersion: '1', members: ['נועה', 'עומר', 'דנה'].map((name, i) => ({
    id: `pick-${i}`, userId: i + 1, memberName: name, pickName: `התחזית של ${name}`,
    seats: { ...result.seats, likud: result.seats.likud - i * 2, yashar: result.seats.yashar + i * 2 },
    turnoutPercentage: 70 + i, submittedAt: '2026-10-26T12:00:00Z',
  })),
};
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 1120, margin: 'auto', padding: '24px' }}>
  <p>תצוגה מקומית · תחזיות לדוגמה</p>
  {new URLSearchParams(location.search).has('league') ? <LeagueView league={league} allSurveys={results} selectedSurveyId={result.id}
    onSelectSurveyId={() => {}} onOpenCreateLeague={() => {}} onJoinExistingLeagueById={() => {}} onNavigateToPicker={() => {}}/>
    : <ResultsView surveys={results} picks={[]}/>}
</main>);
