import type { Market } from './campaign';

export const topicLabels = { polls: 'סקרים', candidates: 'ראש הממשלה', interviews: 'הריאיון הבא', x: 'מה יכתבו ב־X?', urich: 'פרשת אוריך', election: 'תוצאות הבחירות' };
export const publishers: Record<string, string> = { 'Kan 11': 'כאן 11', 'HaHadashot 12': 'חדשות 12', 'Channel 13': 'חדשות 13', 'Channel 14': 'חדשות 14' };
export function topic(m: Market): keyof typeof topicLabels {
  if (m.contract.presentation?.family === 'prime_minister') return 'candidates';
  if (m.contract.presentation?.family === 'interview' || m.type === 'statement') return 'interviews';
  const monitor = m.contract.monitor as { mode?: string } | undefined;
  if (monitor?.mode === 'news_reporting') return 'urich';
  if (monitor?.mode?.startsWith('x_') || ['mention_count', 'channel_activity'].includes(m.type)) return 'x';
  if (['poll_value', 'poll_movement'].includes(m.type)) return 'polls';
  return 'election';
}
export function friendlyTitle(m: Market) {
  const monitor = m.contract.monitor as { mode?: string; person?: string } | undefined;
  if (monitor?.mode === 'news_reporting' && monitor.person) return `האם תפורסם התכתבות נוספת בין אוריך ל${monitor.person}?`;
  return m.title.replace(' · X', '').replace('האם הפוסט הבא של ', 'הפוסט הבא של ').replace(' יזכיר ', ' — יזכיר ').replace('יפרסם לפחות 5 פוסטים מקוריים בחלון', 'יעלה לפחות 5 פוסטים בתקופה הזו');
}
export function marketGroup(m: Market): { key: string; title: string; label: string; note: string } | null {
  const window = `${m.contract.window_starts_at}:${m.window_ends_at}:${m.closes_at}`;
  const monitor = m.contract.monitor as { mode?: string; person?: string } | undefined;
  if (topic(m) === 'urich' && monitor?.person) return { key: `urich:${window}`, title: 'עם מי תיחשף התכתבות נוספת של אוריך?', label: monitor.person, note: 'כתבה חדשה ב־ynet, ב־N12 או בגלובס. כל שם הוא שאלה נפרדת — ייתכן שיותר מאחד יתקיים.' };
  if (topic(m) === 'x') {
    const name = m.title.match(/^האם (?:הפוסט הבא של )?(.+?) · X/)?.[1];
    if (name) return { key: `x:${m.contract.source_id}:${window}`, title: `מה יכתוב ${name}?`, label: monitor?.mode === 'x_count' ? 'לפחות 5 פוסטים בתקופה הזו' : friendlyTitle(m).split(' — יזכיר ')[1]?.replace(/\?$/, '') ?? friendlyTitle(m), note: 'הנושאים מתייחסים לפוסט המקורי הראשון בחלון. פוסט אחד יכול להזכיר כמה נושאים.' };
  }
  if (topic(m) === 'polls' && m.contract.publisher) return { key: `poll:${m.contract.publisher}:${m.contract.pollster}:${window}`, title: `מה יראה הסקר הבא של ${publishers[m.contract.publisher] ?? m.contract.publisher}?`, label: m.title.replace(/^האם /, '').replace(/ בסקר הבא של .+\?$/, '?'), note: 'כל שורה היא שאלה נפרדת. ההכרעה לפי הסקר והמכון שמוגדרים בכללים.' };
  return null;
}
