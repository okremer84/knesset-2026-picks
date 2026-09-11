import type { Survey } from '../types';

// Derive both the displayed and submitted value from the current API options.
export function resolveOpinionPollId(surveys: Survey[], selectedId: string): string {
  const polls = surveys.filter(s => s.kind === 'opinion_poll');
  return polls.find(s => s.id === selectedId)?.id ?? polls[0]?.id ?? '';
}
