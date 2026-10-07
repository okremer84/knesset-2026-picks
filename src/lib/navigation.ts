import type { LeagueSummary } from '../types';
import type { AppTab } from '../components/Header';

export function initialTab(params: URLSearchParams, saved: unknown): AppTab {
  const valid = (value: unknown): value is AppTab => ['picker', 'league', 'surveys', 'historical'].includes(value as string);
  if (params.has('invite')) return 'league';
  const tab = params.get('tab');
  if (valid(tab)) return tab;
  if (params.has('league')) return 'league';
  return valid(saved) ? saved : 'picker';
}


export async function initialLeagueId(
  params: URLSearchParams,
  leagues: LeagueSummary[],
  join: (code: string) => Promise<boolean>,
): Promise<string | null> {
  const invite = params.get('invite');
  if (invite && await join(invite)) return null; // Joining already selected the league.
  return params.get('league') || leagues[0]?.id || null;
}

export async function loadInitialLeague(
  id: string,
  leagues: LeagueSummary[],
  fetchLeague: (id: string) => Promise<Response>,
): Promise<Response> {
  const response = await fetchLeague(id);
  const fallback = leagues.find(league => league.id !== id);
  if ([403, 404].includes(response.status) && fallback) {
    return fetchLeague(fallback.id);
  }
  return response;
}
