import { HistoricalElection } from '../types';

export const HISTORICAL_ELECTIONS: HistoricalElection[] = [
  {
    knessetNumber: 25,
    knessetName: 'הבחירות לכנסת העשרים וחמש',
    date: '1 בנובמבר 2022',
    turnoutPercentage: 70.6,
    primeMinisterElected: 'בנימין נתניהו',
    keyEvents: 'ריצה משותפת של סמוטריץ\' ובן גביר (14 מנדטים). מרצ (3.16%) ובל"ד (2.9%) נפלו מתחת לאחוז החסימה (3.25%), מה שהעניק יתרון מכריע לגוש הימין שהשיג 64 מנדטים למרות פער קולות כולל זעום.',
    results: [
      { partyName: 'הליכוד', seats: 32, leader: 'בנימין נתניהו', color: '#1d4ed8', bloc: 'coalition' },
      { partyName: 'יש עתיד', seats: 24, leader: 'יאיר לפיד', color: '#f59e0b', bloc: 'opposition' },
      { partyName: 'הציונות הדתית ועוצמה יהודית', seats: 14, leader: 'סמוטריץ\' ובן גביר', color: '#ea580c', bloc: 'coalition' },
      { partyName: 'המחנה הממלכתי (גנץ ואיזנקוט)', seats: 12, leader: 'בני גנץ', color: '#0284c7', bloc: 'opposition' },
      { partyName: 'ש"ס', seats: 11, leader: 'אריה דרעי', color: '#334155', bloc: 'coalition' },
      { partyName: 'יהדות התורה', seats: 7, leader: 'יצחק גולדקנופף', color: '#475569', bloc: 'coalition' },
      { partyName: 'ישראל ביתנו', seats: 6, leader: 'אביגדור ליברמן', color: '#2563eb', bloc: 'opposition' },
      { partyName: 'רע"ם', seats: 5, leader: 'מנסור עבאס', color: '#15803d', bloc: 'arab' },
      { partyName: 'חד"ש-תע"ל', seats: 5, leader: 'איימן עודה ואחמד טיבי', color: '#dc2626', bloc: 'arab' },
      { partyName: 'העבודה', seats: 4, leader: 'מרב מיכאלי', color: '#16a34a', bloc: 'opposition' },
    ],
    blocTotals: {
      coalition: 64,
      opposition: 46,
      arab: 10,
      other: 0
    },
    pollVsRealityNotes: 'הסקרים חזו בממוצע 60-61 לגוש נתניהו. ביום הבחירות, אי-מעבר של מרצ ובל"ד (שאיבדו כ-280,000 קולות שירדו לטמיון) הקפיץ את הגוש ל-64 מנדטים.'
  },
  {
    knessetNumber: 24,
    knessetName: 'הבחירות לכנסת העשרים וארבע',
    date: '23 במרץ 2021',
    turnoutPercentage: 67.4,
    primeMinisterElected: 'נפתלי בנט / יאיר לפיד (ממשלת שינוי)',
    keyEvents: 'הקמת "ממשלת השינוי" והרוטציה ההיסטורית. רע"ם בראשות מנסור עבאס חצתה לראשונה את הקווים כחלק מהקואליציה עם 4 מנדטים. ימינה עם 7 מנדטים הובילה את הממשלה.',
    results: [
      { partyName: 'הליכוד', seats: 30, leader: 'בנימין נתניהו', color: '#1d4ed8', bloc: 'coalition' },
      { partyName: 'יש עתיד', seats: 17, leader: 'יאיר לפיד', color: '#f59e0b', bloc: 'opposition' },
      { partyName: 'ש"ס', seats: 9, leader: 'אריה דרעי', color: '#334155', bloc: 'coalition' },
      { partyName: 'כחול לבן', seats: 8, leader: 'בני גנץ', color: '#0284c7', bloc: 'opposition' },
      { partyName: 'ימינה', seats: 7, leader: 'נפתלי בנט', color: '#059669', bloc: 'opposition' },
      { partyName: 'העבודה', seats: 7, leader: 'מרב מיכאלי', color: '#16a34a', bloc: 'opposition' },
      { partyName: 'יהדות התורה', seats: 7, leader: 'משה גפני', color: '#475569', bloc: 'coalition' },
      { partyName: 'ישראל ביתנו', seats: 7, leader: 'אביגדור ליברמן', color: '#2563eb', bloc: 'opposition' },
      { partyName: 'הציונות הדתית', seats: 6, leader: 'בצלאל סמוטריץ\'', color: '#ea580c', bloc: 'coalition' },
      { partyName: 'הרשימה המשותפת', seats: 6, leader: 'איימן עודה', color: '#dc2626', bloc: 'arab' },
      { partyName: 'תקווה חדשה', seats: 6, leader: 'גדעון סער', color: '#4338ca', bloc: 'opposition' },
      { partyName: 'מרצ', seats: 6, leader: 'ניצן הורוביץ', color: '#22c55e', bloc: 'opposition' },
      { partyName: 'רע"ם', seats: 4, leader: 'מנסור עבאס', color: '#15803d', bloc: 'arab' },
    ],
    blocTotals: {
      coalition: 52,
      opposition: 58,
      arab: 10,
      other: 0
    },
    pollVsRealityNotes: 'סקרים צפו שרע"ם תתרסק מתחת לאחוז החסימה; בסופו של דבר עבאס הפתיע עם 4 מנדטים והפך ללשון המאזניים הדרמטית של הממשלה.'
  },
  {
    knessetNumber: 23,
    knessetName: 'הבחירות לכנסת העשרים ושלוש',
    date: '2 במרץ 2020',
    turnoutPercentage: 71.5,
    primeMinisterElected: 'בנימין נתניהו (ממשלת אחדות עם גנץ)',
    keyEvents: 'שיא כוח לרשימה המשותפת (15 מנדטים). הליכוד הגיע ל-36 מנדטים. כחול לבן 33. פרוץ מגפת הקורונה הוביל לממשלת חילופים נתניהו-גנץ שלא החזיקה מעמד.',
    results: [
      { partyName: 'הליכוד', seats: 36, leader: 'בנימין נתניהו', color: '#1d4ed8', bloc: 'coalition' },
      { partyName: 'כחול לבן', seats: 33, leader: 'בני גנץ', color: '#0284c7', bloc: 'opposition' },
      { partyName: 'הרשימה המשותפת', seats: 15, leader: 'איימן עודה', color: '#dc2626', bloc: 'arab' },
      { partyName: 'ש"ס', seats: 9, leader: 'אריה דרעי', color: '#334155', bloc: 'coalition' },
      { partyName: 'יהדות התורה', seats: 7, leader: 'יעקב ליצמן', color: '#475569', bloc: 'coalition' },
      { partyName: 'העבודה-גשר-מרצ', seats: 7, leader: 'עמיר פרץ', color: '#16a34a', bloc: 'opposition' },
      { partyName: 'ישראל ביתנו', seats: 7, leader: 'אביגדור ליברמן', color: '#2563eb', bloc: 'opposition' },
      { partyName: 'ימינה', seats: 6, leader: 'נפתלי בנט', color: '#059669', bloc: 'coalition' },
    ],
    blocTotals: {
      coalition: 58,
      opposition: 47,
      arab: 15,
      other: 0
    },
    pollVsRealityNotes: 'הרשימה המשותפת זינקה מעל כל תחזיות הסקרים עקב התגייסות שיא של 64.8% בחברה הערבית.'
  },
  {
    knessetNumber: 22,
    knessetName: 'הבחירות לכנסת העשרים ושתיים',
    date: '17 בספטמבר 2019',
    turnoutPercentage: 69.8,
    primeMinisterElected: 'פלונטר פוליטי (בחירות חוזרות)',
    keyEvents: 'כחול לבן עקפה את הליכוד במנדט אחד (33 לעומת 32). אף מועמד לא הצליח להרכיב קואליציה וישראל הלכה למערכת בחירות שלישית בתוך פחות משנה.',
    results: [
      { partyName: 'כחול לבן', seats: 33, leader: 'בני גנץ', color: '#0284c7', bloc: 'opposition' },
      { partyName: 'הליכוד', seats: 32, leader: 'בנימין נתניהו', color: '#1d4ed8', bloc: 'coalition' },
      { partyName: 'הרשימה המשותפת', seats: 13, leader: 'איימן עודה', color: '#dc2626', bloc: 'arab' },
      { partyName: 'ש"ס', seats: 9, leader: 'אריה דרעי', color: '#334155', bloc: 'coalition' },
      { partyName: 'ישראל ביתנו', seats: 8, leader: 'אביגדור ליברמן', color: '#2563eb', bloc: 'opposition' },
      { partyName: 'יהדות התורה', seats: 8, leader: 'יעקב ליצמן', color: '#475569', bloc: 'coalition' },
      { partyName: 'ימינה', seats: 7, leader: 'איילת שקד', color: '#059669', bloc: 'coalition' },
      { partyName: 'העבודה-גשר', seats: 6, leader: 'עמיר פרץ', color: '#16a34a', bloc: 'opposition' },
      { partyName: 'המחנה הדמוקרטי (מרצ)', seats: 5, leader: 'ניצן הורוביץ', color: '#22c55e', bloc: 'opposition' },
    ],
    blocTotals: {
      coalition: 55,
      opposition: 52,
      arab: 13,
      other: 0
    },
    pollVsRealityNotes: 'ליברמן עם "ממשלת אחדות חילונית" הפך ללשון מאזניים קשוחה ולא איפשר לאף צד 61.'
  }
];

export const HISTORICAL_INSIGHTS = [
  {
    title: 'מלכודת אחוז החסימה (3.25%)',
    content: 'בכל מערכות הבחירות האחרונות, ההכרעה נפלה על מפלגות שנעו סביב סף 4 המנדטים (כ-150,000 קולות). מפלגה שנופלת מאבדת את כל כוחה ומעניקה למחנה הנגדי יתרון פסיכולוגי ואלקטורלי עצום.'
  },
  {
    title: 'הסטייה הקלאסית של הסקרים בישראל',
    content: 'בממוצע בחמשת סבבי הבחירות האחרונים, סקרי סוף השבוע הראו סטיית תקן של כ-1.8 מנדטים למפלגה גדולה ו-1.1 למפלגה קטנה. הליכוד והמפלגות החרדיות נוטות ל"שתיית קולות" ועלייה של 1-3 מנדטים ביום הבחירות ("יום הבוחר").'
  },
  {
    title: 'אחוז ההצבעה - המשחק של ההכרעה',
    content: 'כל עלייה של 1% באחוז ההצבעה הארצי שוות ערך לכ-48,000 קולות, ומעלה את הרף הנדרש לעבור את אחוז החסימה בכ-1,500 קולות. אחוזי הצבעה בריכוזים מסוימים משנים את מפת הגושים בשעות הערב.'
  }
];
