import type { LeagueSummary } from '../types';

export async function initialLeagueId(
  params: URLSearchParams,
  leagues: LeagueSummary[],
  join: (code: string) => Promise<boolean>,
): Promise<string | null> {
  const invite = params.get('invite');
  if (invite && await join(invite)) return null; // Joining already selected the league.
  return params.get('league') || leagues[0]?.id || null;
}

export function leaveResetRoute(location: Pick<Location, 'pathname'>, history: Pick<History, 'replaceState'>) {
  if (location.pathname.startsWith('/reset-password/')) history.replaceState({}, '', '/');
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
