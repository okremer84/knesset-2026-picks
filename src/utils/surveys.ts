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

const PUBLISHER_NAMES: Record<string, string> = {
  'HaHadashot 12': 'חדשות 12',
  'Kan 11': 'כאן 11',
  'Channel 13': 'חדשות 13',
  'Channel 14': 'ערוץ 14',
  'i24 News': 'איי־24',
  'Maariv': 'מעריב',
  'Walla': 'וואלה',
  'Zman Yisrael': 'זמן ישראל',
  'Israel Hayom': 'ישראל היום',
};

const INSTITUTE_NAMES: Record<string, string> = {
  'Midgam R&C': 'מדגם',
  'Kantar': 'קנטאר',
  'SF+ND': 'שלמה פילבר ונקסט דאטה',
  'Yossi Tatika': 'יוסי טאטיקה',
  'Direct Polls': 'דיירקט פולס',
  'LRI+P4A': 'לזר מחקרים ופאנל פור אול',
  'MP+TM+SN+A': 'מדגם פרויקט, המדד, סטאט־נט ואסקריא',
  'Maagar Mochot': 'מאגר מוחות',
};

export function surveyTitle(survey: Survey): string {
  const publisher = PUBLISHER_NAMES[survey.channelOrMedia];
  return publisher && survey.title === `${survey.channelOrMedia} · ${survey.date}`
    ? `${publisher} · ${survey.date}`
    : survey.title;
}

// Keep source names and poll identities intact; translate only their display.
export function localizeSurvey(survey: Survey): Survey {
  return {
    ...survey,
    title: surveyTitle(survey),
    channelOrMedia: PUBLISHER_NAMES[survey.channelOrMedia] ?? survey.channelOrMedia,
    institute: INSTITUTE_NAMES[survey.institute] ?? survey.institute,
  };
}

export function latestPollsByChannel(surveys: Survey[], cutoff: string): Survey[] {
  const channels = new Map<string, Survey>();
  for (const survey of [...surveys].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))) {
    if (survey.date > cutoff) continue;
    const channel = survey.channelOrMedia || survey.title;
    if (!channels.has(channel)) channels.set(channel, survey);
  }
  return [...channels.values()];
}

export function latestElectionResults(surveys: Survey[], cutoff = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())): Survey[] {
  const actual = surveys.filter(s => isActualResult(s) && s.date <= cutoff).sort((a, b) =>
    Number(b.kind === 'official_results') - Number(a.kind === 'official_results')
    || (b.publishedAt ?? b.date).localeCompare(a.publishedAt ?? a.date));
  if (actual.length) return [actual[0]];
  const channels = new Map<string, Survey>();
  const results = surveys.filter(s => (s.kind === 'exit_poll' || s.kind === 'official_results') && s.date <= cutoff);
  for (const survey of results.sort((a, b) => b.date.localeCompare(a.date)
    || (b.publishedAt ?? b.syncedAt ?? '').localeCompare(a.publishedAt ?? a.syncedAt ?? '')
    || b.id.localeCompare(a.id))) {
    const channel = survey.channelOrMedia || survey.title;
    if (!channels.has(channel)) channels.set(channel, survey);
  }
  return [...channels.values()].sort((a, b) => Number(b.kind === 'official_results') - Number(a.kind === 'official_results')
    || Number(a.channelOrMedia.match(/\d+/)?.[0] ?? Infinity) - Number(b.channelOrMedia.match(/\d+/)?.[0] ?? Infinity)
    || a.channelOrMedia.localeCompare(b.channelOrMedia, 'he', { numeric: true }));
}

export function isActualResult(survey: Survey | null | undefined): boolean {
  return survey?.kind === 'actual_results' || survey?.kind === 'official_results';
}
