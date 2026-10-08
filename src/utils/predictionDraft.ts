import { PARTIES_LIST } from '../data/parties';
import type { Prediction } from '../types';

export interface PredictionDetails {
  pickName: string;
  note: string;
  turnoutPercentage: string;
}

export function predictionDetails(prediction?: Prediction): PredictionDetails {
  return { pickName: prediction?.pickName || '', note: prediction?.note || '', turnoutPercentage: String(prediction?.turnoutPercentage ?? '') };
}

export function storedPredictionDetails(value: unknown): PredictionDetails | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const details = value as Partial<PredictionDetails>;
  return typeof details.pickName === 'string' && typeof details.note === 'string' && typeof details.turnoutPercentage === 'string'
    ? { pickName: details.pickName, note: details.note, turnoutPercentage: details.turnoutPercentage }
    : undefined;
}

/** Reconcile each field independently so a refresh cannot erase an unfinished edit. */
export function reconcileDetails(draft: PredictionDetails | undefined, previous: PredictionDetails | undefined, submitted: PredictionDetails): PredictionDetails {
  if (!draft) return submitted;
  if (!previous) return draft;
  return {
    pickName: draft.pickName === previous.pickName ? submitted.pickName : draft.pickName,
    note: draft.note === previous.note ? submitted.note : draft.note,
    turnoutPercentage: draft.turnoutPercentage === previous.turnoutPercentage ? submitted.turnoutPercentage : draft.turnoutPercentage,
  };
}

export function sameSeats(a: Record<string, number>, b: Record<string, number>): boolean {
  return PARTIES_LIST.every(p => (a[p.id] || 0) === (b[p.id] || 0));
}

/** Refresh clean drafts from the server, but never replace local edits. */
export function reconcileDraft(draft: Record<string, number>, previous: Record<string, number> | undefined, submitted: Record<string, number>, hasStoredDraft: boolean): Record<string, number> {
  return previous ? (sameSeats(draft, previous) ? submitted : draft) : (hasStoredDraft ? draft : submitted);
}
