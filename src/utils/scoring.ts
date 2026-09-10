import { ScoreResult } from '../types';
import { PARTIES_LIST } from '../data/parties';

export function calculateScore(
  predictedSeats: Record<string, number>,
  actualSeats: Record<string, number>
): ScoreResult {
  let totalSeatDiff = 0;
  let exactHitsCount = 0;

  // Track bloc totals
  const predictedBlocs: Record<string, number> = { coalition: 0, opposition: 0, arab: 0, other: 0 };
  const actualBlocs: Record<string, number> = { coalition: 0, opposition: 0, arab: 0, other: 0 };

  const partyBreakdown = PARTIES_LIST.filter(p => Object.hasOwn(actualSeats, p.id)).map((party) => {
    const predicted = Number(predictedSeats[party.id]) || 0;
    const actual = Number(actualSeats[party.id]) || 0;
    const diff = Math.abs(predicted - actual);

    totalSeatDiff += diff;
    const isExact = diff === 0 && (predicted > 0 || actual > 0);
    if (isExact) {
      exactHitsCount++;
    }

    const partyPoints = diff;

    // Sum blocs
    predictedBlocs[party.bloc] = (predictedBlocs[party.bloc] || 0) + predicted;
    actualBlocs[party.bloc] = (actualBlocs[party.bloc] || 0) + actual;

    return {
      partyId: party.id,
      partyName: party.name,
      color: party.color,
      predicted,
      actual,
      diff,
      points: partyPoints,
      isExact,
    };
  });

  const totalScore = totalSeatDiff;
  const accuracyPercentage = Math.max(0, Math.min(100, Math.round((1 - totalSeatDiff / 240) * 100)));
  let rankTitle = 'ממשיכים לנסות 🗳️';
  if (totalScore === 0) rankTitle = 'תחזית מדויקת 🔮';
  else if (totalScore <= 10) rankTitle = 'אסטרטג פוליטי בכיר 🎯';
  else if (totalScore <= 25) rankTitle = 'פרשן פוליטי מנוסה 🎙️';
  else if (totalScore <= 50) rankTitle = 'עוקב פוליטי חד 📰';

  const blocComparison = [
    {
      bloc: 'coalition',
      blocNameHe: 'גוש הקואליציה',
      predicted: predictedBlocs.coalition || 0,
      actual: actualBlocs.coalition || 0,
      diff: Math.abs((predictedBlocs.coalition || 0) - (actualBlocs.coalition || 0)),
    },
    {
      bloc: 'opposition',
      blocNameHe: 'גוש האופוזיציה',
      predicted: predictedBlocs.opposition || 0,
      actual: actualBlocs.opposition || 0,
      diff: Math.abs((predictedBlocs.opposition || 0) - (actualBlocs.opposition || 0)),
    },
    {
      bloc: 'arab',
      blocNameHe: 'מפלגות ערביות',
      predicted: predictedBlocs.arab || 0,
      actual: actualBlocs.arab || 0,
      diff: Math.abs((predictedBlocs.arab || 0) - (actualBlocs.arab || 0)),
    },
    {
      bloc: 'other',
      blocNameHe: 'אחרות ועצמאיות',
      predicted: predictedBlocs.other || 0,
      actual: actualBlocs.other || 0,
      diff: Math.abs((predictedBlocs.other || 0) - (actualBlocs.other || 0)),
    },
  ];

  return {
    totalScore,
    maxScore: 240,
    accuracyPercentage,
    exactHitsCount,
    totalSeatDiff,
    rankTitle,
    partyBreakdown,
    blocComparison,
  };
}

// Derive game blocs from reported seats when a publisher omits precomputed totals.
export function calculateBlocs(seats: Record<string, number>) {
  const blocs = { coalition: 0, opposition: 0, arab: 0, other: 0 };
  for (const party of PARTIES_LIST) blocs[party.bloc] += seats[party.id] ?? 0;
  return blocs;
}
