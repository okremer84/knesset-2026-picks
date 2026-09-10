export interface Party {
  id: string;
  name: string;
  leader: string;
  ballotLetter: string;
  color: string;
  bloc: 'coalition' | 'opposition' | 'arab' | 'other';
  description?: string;
  leaderImageUrl?: string;
}

export interface Prediction {
  id: string;
  memberName: string;
  seats: Record<string, number>; // partyId -> seat count
  submittedAt: string;
  note?: string;
  turnoutPercentage?: number; // tiebreaker vote participation % (e.g. 71.5)
}

export type ElectionStage = 'voting_open' | 'exit_poll' | 'final_results';

export interface UnsubmittedPlayer {
  id: string;
  name: string;
  joinedAt: string;
}

export interface League {
  id: string;
  name: string;
  description?: string;
  creatorName: string;
  createdAt: string;
  members: Prediction[];
  unsubmittedPlayers?: UnsubmittedPlayer[];
  electionStage?: ElectionStage;
  targetSurveyId?: string; // which survey to rank against by default
  benchmarkTurnoutPercentage?: number; // actual or benchmark turnout % for tiebreaker (e.g. 70.6)
}

export interface Survey {
  kind?: 'opinion_poll' | 'exit_poll' | 'official_results';
  source?: 'wikipedia';
  sourceUrl?: string;
  originalSourceUrls?: string[];
  syncedAt?: string;
  votePercentages?: Record<string, number>;
  notReportedPartyIds?: string[];
  id: string;
  title: string;
  institute: string;
  channelOrMedia: string;
  date: string;
  sampleSize?: number;
  seats: Record<string, number>;
  blocs?: {
    coalition: number;
    opposition: number;
    arab: number;
    other: number;
  };
  notes?: string;
  sourceImageUrl?: string;
}

export interface ScoreResult {
  totalScore: number;
  maxScore: number;
  accuracyPercentage: number;
  exactHitsCount: number;
  totalSeatDiff: number;
  rankTitle: string;
  partyBreakdown: {
    partyId: string;
    partyName: string;
    color: string;
    predicted: number;
    actual: number;
    diff: number;
    points: number;
    isExact: boolean;
  }[];
  blocComparison: {
    bloc: string;
    blocNameHe: string;
    predicted: number;
    actual: number;
    diff: number;
  }[];
}

export interface HistoricalElection {
  knessetNumber: number;
  knessetName: string;
  date: string;
  turnoutPercentage: number;
  primeMinisterElected: string;
  keyEvents: string;
  results: {
    partyName: string;
    seats: number;
    leader: string;
    color: string;
    bloc: 'coalition' | 'opposition' | 'arab' | 'other';
  }[];
  blocTotals: {
    coalition: number;
    opposition: number;
    arab: number;
    other: number;
  };
  pollVsRealityNotes: string;
}
