import { Party } from '../types';

export const PARTIES_LIST: Party[] = [
  {
    id: 'yashar',
    name: 'ישר!',
    leader: 'גדי איזנקוט',
    ballotLetter: 'כן',
    color: '#0284c7',
    bloc: 'opposition',
    description: 'מפלגת מרכז-ביטחונית בהובלת הרמטכ"ל לשעבר גדי איזנקוט',
    leaderImageUrl: '/leaders/yashar.jpg'
  },
  {
    id: 'likud',
    name: 'הליכוד',
    leader: 'בנימין נתניהו',
    ballotLetter: 'מחל',
    color: '#1d4ed8',
    bloc: 'coalition',
    description: 'מפלגת השלטון בראשות ראש הממשלה בנימין נתניהו',
    leaderImageUrl: '/leaders/likud.jpg'
  },
  {
    id: 'beyachad',
    name: 'ביחד',
    leader: 'נפתלי בנט',
    ballotLetter: 'טב',
    color: '#059669',
    bloc: 'opposition',
    description: 'מפלגת ימין ממלכתית בראשות ראש הממשלה לשעבר נפתלי בנט',
    leaderImageUrl: '/leaders/beyachad.jpg'
  },
  {
    id: 'democrats',
    name: 'הדמוקרטים',
    leader: 'יאיר גולן',
    ballotLetter: 'אמת',
    color: '#16a34a',
    bloc: 'opposition',
    description: 'איחוד השמאל הציוני: מפלגת העבודה ומרצ בראשות יאיר גולן',
    leaderImageUrl: '/leaders/democrats.jpg'
  },
  {
    id: 'utj',
    name: 'יהדות התורה',
    leader: 'יצחק גולדקנופף',
    ballotLetter: 'ג',
    color: '#475569',
    bloc: 'coalition',
    description: 'איחוד אגודת ישראל ודגל התורה החרדית-אשכנזית',
    leaderImageUrl: '/leaders/utj.jpg'
  },
  {
    id: 'shas',
    name: 'ש"ס',
    leader: 'אריה דרעי',
    ballotLetter: 'שס',
    color: '#334155',
    bloc: 'coalition',
    description: 'התאחדות הספרדים שומרי תורה בראשות אריה דרעי',
    leaderImageUrl: '/leaders/shas.jpg'
  },
  {
    id: 'israel_beitenu',
    name: 'ישראל ביתנו',
    leader: 'אביגדור ליברמן',
    ballotLetter: 'ל',
    color: '#2563eb',
    bloc: 'opposition',
    description: 'ימין חילוני וליברלי בראשות אביגדור ליברמן',
    leaderImageUrl: '/leaders/israel_beitenu.jpg'
  },
  {
    id: 'otzma_yehudit',
    name: 'עוצמה יהודית',
    leader: 'איתמר בן גביר',
    ballotLetter: 'עצ',
    color: '#ea580c',
    bloc: 'coalition',
    description: 'ימין לאומי בראשות השר איתמר בן גביר',
    leaderImageUrl: '/leaders/otzma_yehudit.jpg'
  },
  {
    id: 'joint_list',
    name: 'הרשימה המשותפת',
    leader: 'איימן עודה',
    ballotLetter: 'ום',
    color: '#dc2626',
    bloc: 'arab',
    description: 'חד"ש ותע"ל בראשות איימן עודה ואחמד טיבי',
    leaderImageUrl: '/leaders/joint_list.jpg'
  },
  {
    id: 'raam',
    name: 'רע"ם',
    leader: 'מנסור עבאס',
    ballotLetter: 'עם',
    color: '#15803d',
    bloc: 'arab',
    description: 'הרשימה הערבית המאוחדת בראשות מנסור עבאס',
    leaderImageUrl: '/leaders/raam.jpg'
  },
  {
    id: 'religious_zionism',
    name: 'הציונות הדתית',
    leader: 'בצלאל סמוטריץ\'',
    ballotLetter: 'ט',
    color: '#d97706',
    bloc: 'coalition',
    description: 'מפלגת הימין הדתי-לאומי בראשות בצלאל סמוטריץ\'',
    leaderImageUrl: '/leaders/religious_zionism.jpg'
  },
  {
    id: 'amcha',
    name: 'עמך ישראל',
    leader: 'תא"ל (במיל\') עופר וינטר',
    ballotLetter: 'עמ',
    color: '#ea580c',
    bloc: 'coalition',
    description: 'מפלגת ימין ביטחונית וציונית בראשות עופר וינטר',
    leaderImageUrl: '/leaders/amcha.png'
  },
  {
    id: 'hendel',
    name: 'המילואימניקים (הנדל וזליכה)',
    leader: 'יועז הנדל וירון זליכה',
    ballotLetter: 'ה',
    color: '#0d9488',
    bloc: 'other',
    description: 'רשימת המילואימניקים, לוחמים וכלכלה בראשות יועז הנדל ופרופ\' ירון זליכה',
    leaderImageUrl: '/leaders/hendel.jpg'
  },
  {
    id: 'kachol_lavan',
    name: 'כחול לבן',
    leader: 'בני גנץ',
    ballotLetter: 'כן',
    color: '#0284c7',
    bloc: 'opposition',
    description: 'מפלגת מרכז ממלכתית בראשות בני גנץ',
    leaderImageUrl: '/leaders/kachol_lavan.jpg'
  },
  {
    id: 'balad',
    name: 'בל"ד',
    leader: 'סאמי אבו שחאדה',
    ballotLetter: 'ד',
    color: '#b91c1c',
    bloc: 'arab',
    description: 'ברית לאומית דמוקרטית בראשות סאמי אבו שחאדה',
    leaderImageUrl: '/leaders/balad.png'
  }
];

export const BLOC_LABELS: Record<string, { nameHe: string; color: string }> = {
  coalition: { nameHe: 'גוש הימין / קואליציה', color: '#1d4ed8' },
  opposition: { nameHe: 'גוש מרכז-שמאל / אופוזיציה', color: '#0284c7' },
  arab: { nameHe: 'מפלגות ערביות', color: '#16a34a' },
  other: { nameHe: 'עצמאיות / לא משויכות', color: '#8b5cf6' },
};
