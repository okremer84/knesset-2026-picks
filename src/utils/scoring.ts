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

  const partyBreakdown = PARTIES_LIST.map((party) => {
    const predicted = Number(predictedSeats[party.id]) || 0;
    const actual = Number(actualSeats[party.id]) || 0;
    const diff = Math.abs(predicted - actual);

    totalSeatDiff += diff;
    const isExact = diff === 0 && (predicted > 0 || actual > 0);
    if (isExact) {
      exactHitsCount++;
    }

    // Party points: 10 points for exact, down to 0 if diff >= 5
    let partyPoints = Math.max(0, 10 - diff * 2);
    if (isExact) {
      partyPoints += 2; // Bonus for exact hit
    }

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

  // Calculate top party prediction
  let maxPredictedParty = '';
  let maxPredictedVal = -1;
  let maxActualParty = '';
  let maxActualVal = -1;

  for (const p of PARTIES_LIST) {
    const pred = Number(predictedSeats[p.id]) || 0;
    const act = Number(actualSeats[p.id]) || 0;
    if (pred > maxPredictedVal) {
      maxPredictedVal = pred;
      maxPredictedParty = p.id;
    }
    if (act > maxActualVal) {
      maxActualVal = act;
      maxActualParty = p.id;
    }
  }

  // Base score: 100 minus penalty for seat deviations
  // Note: Total seat diff across 120 seats: e.g., if sum of diffs is 16, penalty is 16 * 1.5 = 24 -> score 76
  let baseScore = Math.max(0, 100 - Math.round(totalSeatDiff * 1.25));

  // Bonuses
  let bonusPoints = exactHitsCount * 3;
  if (maxPredictedParty === maxActualParty && maxActualVal > 0) {
    bonusPoints += 5; // Correctly guessed largest party
  }

  const coalitionDiff = Math.abs((predictedBlocs.coalition || 0) - (actualBlocs.coalition || 0));
  if (coalitionDiff <= 1) {
    bonusPoints += 5; // Close coalition bloc forecast
  }

  const totalScore = Math.min(120, Math.max(0, baseScore + bonusPoints));
  const accuracyPercentage = Math.max(0, Math.min(100, Math.round((1 - (totalSeatDiff / 240)) * 100)));

  let rankTitle = 'נפל מתחת לאחוז החסימה 🗳️';
  if (totalScore >= 105) rankTitle = 'נביא בחירות אגדי 🔮';
  else if (totalScore >= 92) rankTitle = 'אסטרטג פוליטי בכיר 🎯';
  else if (totalScore >= 80) rankTitle = 'פרשן פוליטי מנוסה 🎙️';
  else if (totalScore >= 65) rankTitle = 'עוקב פוליטי חד 📰';

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
    maxScore: 120,
    accuracyPercentage,
    exactHitsCount,
    totalSeatDiff,
    rankTitle,
    partyBreakdown,
    blocComparison,
  };
}
