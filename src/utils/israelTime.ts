const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function israelLocalTime(instant: string): string {
  return formatter.format(new Date(instant)).replace(' ', 'T');
}
export function israelInstant(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('הזינו תאריך בפורמט DD/MM/YYYY ושעה בפורמט HH:mm');
  const wall = Date.parse(local + 'Z');
  if (!Number.isFinite(wall)) throw new Error('בחרו תאריך ושעה תקינים');
  let instant = wall;
  for (let i = 0; i < 3; i++) instant += wall - Date.parse(israelLocalTime(new Date(instant).toISOString()) + 'Z');
  const result = new Date(instant).toISOString();
  if (israelLocalTime(result) !== local) throw new Error('השעה אינה קיימת בשעון ישראל. בחרו שעה אחרת');
  return result;
}
export function formatIsraelTime(instant: string): string {
  const [date, time] = israelLocalTime(instant).split('T');
  return `${date.split('-').reverse().join('/')} ${time}`;
}
