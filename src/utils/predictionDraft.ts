import { PARTIES_LIST } from '../data/parties';

export function sameSeats(a: Record<string, number>, b: Record<string, number>): boolean {
  return PARTIES_LIST.every(p => (a[p.id] || 0) === (b[p.id] || 0));
}

/** Refresh clean drafts from the server, but never replace local edits. */
export function reconcileDraft(draft: Record<string, number>, previous: Record<string, number> | undefined, submitted: Record<string, number>, hasStoredDraft: boolean): Record<string, number> {
  return previous ? (sameSeats(draft, previous) ? submitted : draft) : (hasStoredDraft ? draft : submitted);
}
