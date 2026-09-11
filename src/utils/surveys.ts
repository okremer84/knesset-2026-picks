import type { Survey } from '../types';

// Derive both the displayed and submitted value from the current API options.
export function resolveOpinionPollId(surveys: Survey[], selectedId: string): string {
  const polls = surveys.filter(s => s.kind === 'opinion_poll');
  return polls.find(s => s.id === selectedId)?.id ?? polls[0]?.id ?? '';
}

export function surveySyncNotice(count: number, sync?: { status: string } | null): string {
  if (!count) return 'אין כרגע סקרים זמינים בשרת';
  if (!sync) return 'מוצג עותק התחלתי שמור; טרם הושלם עדכון סקרים מהמקור';
  if (sync.status === 'succeeded') return '';
  if (sync.status === 'failed') return 'עדכון הסקרים האחרון נכשל. מוצגים הנתונים השמורים מהעדכון התקין האחרון או מהעותק ההתחלתי.';
  return 'עדכון הסקרים טרם הושלם. מוצגים הנתונים השמורים.';
}
