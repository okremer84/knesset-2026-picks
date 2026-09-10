import { PARTIES_LIST } from '../../src/data/parties';
import type { Survey } from '../../src/types';

export interface Poll {
  id: string;
  fieldwork_end: string;
  fieldwork_label: string;
  pollster: string;
  publisher: string;
  sample_size_raw: string;
  results: { party: string; seats: number | null; vote_percent: number | null; raw: string }[];
  sources: string[];
  issues: string[];
}

// Explicit current-list mappings. Historical constituent parties must not be
// collapsed into today's alliances. A changed source label goes to review.
export const PARTY_ALIASES: Record<string, string> = {
  Likud: 'likud', Together: 'beyachad', 'RZP - Zehut': 'religious_zionism',
  Otzma: 'otzma_yehudit', 'Blue & White': 'kachol_lavan', Shas: 'shas',
  UTJ: 'utj', 'Yisrael Beiteinu': 'israel_beitenu', "Ra'am": 'raam',
  'Joint List': 'joint_list', Dems: 'democrats', Yashar: 'yashar',
  'Reserv. - NEP': 'hendel', 'Amcha Yisrael': 'amcha',
};

export const CURRENT_LISTS_FROM = '2026-09-08';

export function mapSurvey(poll: Poll, syncedAt: string): Survey {
  if (poll.issues.length || poll.fieldwork_end < CURRENT_LISTS_FROM) {
    throw new Error('Poll is invalid or predates the current ballot mapping');
  }
  const seats: Record<string, number> = {};
  const votePercentages: Record<string, number> = {};
  for (const result of poll.results) {
    const id = PARTY_ALIASES[result.party];
    if (!id || !PARTIES_LIST.some(p => p.id === id)) throw new Error(`Unmapped party: ${result.party}`);
    if (id in seats) throw new Error(`Duplicate party mapping: ${id}`);
    if (result.seats === null || !Number.isInteger(result.seats) || result.seats < 0 || result.seats > 120) {
      throw new Error(`Unknown or invalid seats: ${result.party}`);
    }
    seats[id] = result.seats;
    if (result.vote_percent !== null) votePercentages[id] = result.vote_percent;
  }
  if (Object.values(seats).reduce((a, b) => a + b, 0) !== 120) throw new Error('Mapped seats do not total 120');
  // Balad is not separately reported in the current table. Leave it absent,
  // record that fact, and never invent a separate reported result for it.
  const notReportedPartyIds = PARTIES_LIST.filter(p => !(p.id in seats)).map(p => p.id);
  if (notReportedPartyIds.some(id => id !== 'balad')) throw new Error(`Incomplete poll: ${notReportedPartyIds.join(', ')}`);
  const blocs = { coalition: 0, opposition: 0, arab: 0, other: 0 };
  for (const party of PARTIES_LIST) blocs[party.bloc] += seats[party.id] ?? 0;
  const sample = poll.sample_size_raw.replaceAll(',', '');
  return {
    id: `wiki-${poll.id}`, title: `${poll.publisher} · ${poll.fieldwork_end}`,
    institute: poll.pollster, channelOrMedia: poll.publisher, date: poll.fieldwork_end,
    ...( /^\d+$/.test(sample) ? { sampleSize: Number(sample) } : {} ),
    seats, blocs, kind: 'opinion_poll', source: 'wikipedia',
    sourceUrl: 'https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Israeli_legislative_election',
    originalSourceUrls: poll.sources, syncedAt, votePercentages, notReportedPartyIds,
    notes: `תאריכי הסקר במקור: ${poll.fieldwork_label}. נתוני הסקר נאספו מוויקיפדיה; חלוקת הגושים מחושבת לפי הגדרות המשחק.`,
  };
}
