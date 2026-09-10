import express from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_SURVEYS } from './src/data/surveys.js';
import { League, Prediction, Survey } from './src/types.js';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Ensure data folder exists
const DATA_DIR = path.join(process.cwd(), 'data');
const LEAGUES_FILE = path.join(DATA_DIR, 'leagues.json');
const CUSTOM_SURVEYS_FILE = path.join(DATA_DIR, 'custom_surveys.json');
const POLL_SURVEYS_FILE = process.env.POLL_SURVEYS_FILE || path.join(DATA_DIR, 'wikipedia-surveys.json');

function loadSurveys(): Survey[] {
  let polls = DEFAULT_SURVEYS;
  try {
    const feed = JSON.parse(fs.readFileSync(POLL_SURVEYS_FILE, 'utf8'));
    if (Array.isArray(feed.surveys) && feed.surveys.length) polls = feed.surveys;
  } catch (error) {
    console.warn('Using bundled Wikipedia poll snapshot:', String(error));
  }
  return [...loadCustomSurveys(), ...polls].sort((a, b) => b.date.localeCompare(a.date));
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial demo leagues if none exists
const SEED_LEAGUES: League[] = [
  {
    id: 'knesset26-official',
    name: 'ליגת הבחירות הארצית לכנסת ה-26 🇮🇱',
    description: 'הליגה הפתוחה לכל חובבי הפוליטיקה בישראל. מי יקלע הכי קרוב לחלוקת 120 המנדטים?',
    creatorName: 'מערכת פנטזי בחירות',
    createdAt: new Date().toISOString(),
    targetSurveyId: DEFAULT_SURVEYS[0]?.id,
    electionStage: 'voting_open',
    unsubmittedPlayers: [
      {
        id: 'unsub-1',
        name: 'רוני כהן',
        joinedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
      },
      {
        id: 'unsub-2',
        name: 'שירה לוי',
        joinedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
    ],
    members: [
      {
        id: 'pred-1',
        memberName: 'דני הפרשן',
        submittedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        note: 'בנט ואיזנקוט ישנו את המפה הפוליטית',
        seats: {
          yashar: 22,
          likud: 22,
          beyachad: 13,
          democrats: 10,
          utj: 8,
          shas: 8,
          israel_beitenu: 8,
          otzma_yehudit: 7,
          joint_list: 6,
          raam: 5,
          religious_zionism: 5,
          amcha: 3,
          hendel: 3,
          yesh_atid: 0,
          balad: 0,
          yamin_mamlachti: 0,
          other_parties: 0,
        },
      },
      {
        id: 'pred-2',
        memberName: 'מיכל ירושלים',
        submittedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        note: 'הליכוד יתחזק בימי הבחירות האחרונים',
        seats: {
          likud: 26,
          yashar: 20,
          beyachad: 11,
          shas: 9,
          utj: 8,
          democrats: 9,
          otzma_yehudit: 8,
          israel_beitenu: 7,
          joint_list: 6,
          religious_zionism: 5,
          raam: 5,
          amcha: 3,
          hendel: 3,
          yesh_atid: 0,
          balad: 0,
          yamin_mamlachti: 0,
          other_parties: 0,
        },
      },
      {
        id: 'pred-3',
        memberName: 'יוסי מהמילואים',
        submittedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        note: 'הפתעות של מפלגות הרמטכ"לים והימין',
        seats: {
          yashar: 25,
          likud: 20,
          beyachad: 14,
          democrats: 9,
          utj: 8,
          shas: 7,
          israel_beitenu: 7,
          otzma_yehudit: 7,
          joint_list: 6,
          raam: 5,
          religious_zionism: 5,
          amcha: 4,
          hendel: 3,
          yesh_atid: 0,
          balad: 0,
          yamin_mamlachti: 0,
          other_parties: 0,
        },
      }
    ]
  }
];

function loadLeagues(): Record<string, League> {
  try {
    if (fs.existsSync(LEAGUES_FILE)) {
      const data = fs.readFileSync(LEAGUES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading leagues file:', err);
  }
  const initialMap: Record<string, League> = {};
  for (const l of SEED_LEAGUES) {
    initialMap[l.id] = l;
  }
  saveLeagues(initialMap);
  return initialMap;
}

function saveLeagues(leagues: Record<string, League>) {
  try {
    fs.writeFileSync(LEAGUES_FILE, JSON.stringify(leagues, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing leagues file:', err);
  }
}

function loadCustomSurveys(): Survey[] {
  try {
    if (fs.existsSync(CUSTOM_SURVEYS_FILE)) {
      const data = fs.readFileSync(CUSTOM_SURVEYS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading custom surveys:', err);
  }
  return [];
}

function saveCustomSurveys(surveys: Survey[]) {
  try {
    fs.writeFileSync(CUSTOM_SURVEYS_FILE, JSON.stringify(surveys, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving custom surveys:', err);
  }
}

// Gemini AI client helper (lazy initialization)
let geminiAi: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!geminiAi) {
    geminiAi = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiAi;
}

// ================= API ROUTES =================

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Read the generated feed each request, so server-side syncs need no restart.
app.get('/api/surveys', (req, res) => {
  res.json({ surveys: loadSurveys() });
});

// Scan poll screenshot with Gemini
app.post('/api/surveys/scan', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/png' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 data' });
    }

    // Clean base64 prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const ai = getGeminiClient();
    const prompt = `אתה מומחה לניתוח סקרי בחירות לכנסת בישראל ולפענוח גרפיקה פוליטית.
לפניך תמונת סקר בחירות בישראל (לדוגמה מערוץ 11 / 12 / 14 / מעריב וכו').
אנא פענח את התמונה בדייקנות מקסימלית והחזר אובייקט JSON תקני בלבד (ללא מרקדאון או טקסט נוסף) עם המבנה הבא:

{
  "title": "שם הסקר, למשל: סקר כאן 11 (מכון קאנטאר) - הראשון אחרי סגירת הרשימות",
  "institute": "מכון הסקרים (למשל: מכון קאנטאר, מכון מדגם, דיירקט פולס, לזר מחקרים)",
  "channelOrMedia": "ערוץ השידור / עיתון (למשל: כאן חדשות 11, חדשות 12, ערוץ 14, מעריב)",
  "sampleSize": 554,
  "notes": "תיאור קצר או כתוביות נוספות המופיעות בתמונה כגון נשאלים או חלוקת גושים",
  "seats": {
    "likud": 21,
    "yashar": 24,
    "beyachad": 12,
    "democrats": 9,
    "utj": 8,
    "shas": 7,
    "israel_beitenu": 7,
    "otzma_yehudit": 7,
    "joint_list": 7,
    "raam": 5,
    "religious_zionism": 5,
    "amcha": 4,
    "hendel": 4,
    "yesh_atid": 0,
    "balad": 0,
    "yamin_mamlachti": 0,
    "other_parties": 0
  },
  "blocs": {
    "coalition": 52,
    "opposition": 52,
    "arab": 12,
    "other": 4
  }
}

דגשים:
1. ודא שמספרי המנדטים מתאימים במדויק לתמונה וסכומם מסתכם ל-120 מנדטים.
2. השתמש במפתחות המפלגות באנגלית:
   - yashar: ישר! / איזנקוט
   - likud: הליכוד / נתניהו
   - beyachad: ביחד / בנט
   - democrats: הדמוקרטים / גולן
   - israel_beitenu: ישראל ביתנו / ליברמן
   - utj: יהדות התורה / גולדקנופף
   - shas: ש"ס / דרעי
   - joint_list: המשותפת / חד"ש-תע"ל / עודה / טיבי
   - otzma_yehudit: עוצמה יהודית / בן גביר
   - religious_zionism: הציונות הדתית / סמוטריץ'
   - raam: רע"ם / עבאס
   - amcha: עמך ישראל / עופר וינטר
   - hendel: המילואימניקים (הנדל וזליכה) / יועז הנדל / ירון זליכה
   - kachol_lavan: כחול לבן / בני גנץ
   - balad: בל"ד
3. אם יש מפלגות שלא קיבלו מנדטים או לא מופיעות בתמונה כבעלות מנדטים (כמו מפלגות מתחת לאחוז החסימה), רשום 0.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    const parsedData = JSON.parse(responseText);

    const newSurvey: Survey = {
      id: 'scanned-' + Date.now(),
      title: parsedData.title || 'סקר מנותח מתוך תמונה',
      institute: parsedData.institute || 'פענוח סקר AI',
      channelOrMedia: parsedData.channelOrMedia || 'סריקה חזותית',
      date: new Date().toISOString().split('T')[0],
      sampleSize: parsedData.sampleSize,
      notes: parsedData.notes || 'נותח אוטומטית באמצעות Gemini AI',
      seats: parsedData.seats || {},
      blocs: parsedData.blocs,
    };

    // Save to custom surveys list
    const custom = loadCustomSurveys();
    custom.unshift(newSurvey);
    saveCustomSurveys(custom);

    res.json({ success: true, survey: newSurvey });
  } catch (err: any) {
    console.error('Error scanning poll image:', err);
    res.status(500).json({
      error: 'Failed to scan poll image',
      details: err?.message || 'שגיאה בפענוח תמונת הסקר. נסה תמונה ברורה יותר.',
    });
  }
});

// List leagues
app.get('/api/leagues', (req, res) => {
  const leagues = loadLeagues();
  res.json({ leagues: Object.values(leagues) });
});

// Get single league by ID
app.get('/api/leagues/:id', (req, res) => {
  const leagues = loadLeagues();
  const league = leagues[req.params.id];
  if (!league) {
    return res.status(404).json({ error: 'הליגה המבוקשת לא נמצאה' });
  }
  res.json({ league });
});

// Create new league
app.post('/api/leagues', (req, res) => {
  try {
    const { name, creatorName, description, targetSurveyId } = req.body;
    if (!name || !creatorName) {
      return res.status(400).json({ error: 'שם ליגה ושם יוצר הינם שדות חובה' });
    }

    // Generate readable random ID (e.g. isr-7842)
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const id = `knesset-${randomCode}`;

    const newLeague: League = {
      id,
      name: name.trim(),
      description: description ? description.trim() : undefined,
      creatorName: creatorName.trim(),
      createdAt: new Date().toISOString(),
      targetSurveyId: targetSurveyId || loadSurveys()[0]?.id,
      members: [],
    };

    const leagues = loadLeagues();
    leagues[id] = newLeague;
    saveLeagues(leagues);

    res.json({ success: true, league: newLeague });
  } catch (err: any) {
    console.error('Error creating league:', err);
    res.status(500).json({ error: 'שגיאה ביצירת ליגה' });
  }
});

// Submit / Join prediction to a league
app.post('/api/leagues/:id/predict', (req, res) => {
  try {
    const { memberName, seats, note } = req.body;
    const leagueId = req.params.id;

    if (!memberName || !seats) {
      return res.status(400).json({ error: 'שם משתתף ופירוט מנדטים הינם חובה' });
    }

    // Validate 120 seats sum
    let totalSeats = 0;
    for (const key of Object.keys(seats)) {
      totalSeats += Number(seats[key]) || 0;
    }

    if (totalSeats !== 120) {
      return res.status(400).json({
        error: `סך המנדטים חייב להיות בדיוק 120. כרגע הוזנו ${totalSeats} מנדטים.`,
      });
    }

    const leagues = loadLeagues();
    const league = leagues[leagueId];
    if (!league) {
      return res.status(404).json({ error: 'הליגה לא נמצאה' });
    }

    const newPrediction: Prediction = {
      id: `pred-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      memberName: memberName.trim(),
      seats,
      submittedAt: new Date().toISOString(),
      note: note ? note.trim() : undefined,
    };

    // If member already exists, update their prediction, else append
    const existingIndex = league.members.findIndex(
      (m) => m.memberName.toLowerCase() === memberName.trim().toLowerCase()
    );

    if (existingIndex >= 0) {
      league.members[existingIndex] = newPrediction;
    } else {
      league.members.push(newPrediction);
    }

    // Remove from unsubmitted players if listed
    if (league.unsubmittedPlayers && Array.isArray(league.unsubmittedPlayers)) {
      league.unsubmittedPlayers = league.unsubmittedPlayers.filter(
        (p) => p.name.toLowerCase() !== memberName.trim().toLowerCase()
      );
    }

    leagues[leagueId] = league;
    saveLeagues(leagues);

    res.json({ success: true, prediction: newPrediction, league });
  } catch (err: any) {
    console.error('Error submitting prediction:', err);
    res.status(500).json({ error: 'שגיאה בשמירת התחזית' });
  }
});

// Update election stage for a league
app.post('/api/leagues/:id/stage', (req, res) => {
  try {
    const { stage, targetSurveyId } = req.body;
    const leagueId = req.params.id;
    const leagues = loadLeagues();
    const league = leagues[leagueId];
    if (!league) {
      return res.status(404).json({ error: 'הליגה לא נמצאה' });
    }

    if (!['voting_open', 'exit_poll', 'final_results'].includes(stage)) {
      return res.status(400).json({ error: 'שלב בחירות לא תקין' });
    }
    if (stage !== 'voting_open') {
      const requiredKind = stage === 'exit_poll' ? 'exit_poll' : 'official_results';
      if (!loadSurveys().some(s => s.id === targetSurveyId && s.kind === requiredKind)) {
        return res.status(400).json({ error: 'טרם פורסמו נתונים מאומתים לשלב זה' });
      }
    }
    if (stage) {
      league.electionStage = stage;
    }
    if (targetSurveyId) {
      league.targetSurveyId = targetSurveyId;
    }

    leagues[leagueId] = league;
    saveLeagues(leagues);

    res.json({ success: true, league });
  } catch (err: any) {
    console.error('Error updating stage:', err);
    res.status(500).json({ error: 'שגיאה בעדכון שלב הבחירות' });
  }
});

// Add invited/unsubmitted player to league roster
app.post('/api/leagues/:id/players', (req, res) => {
  try {
    const { name } = req.body;
    const leagueId = req.params.id;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'שם שחקן הינו שדה חובה' });
    }
    const cleanName = name.trim();
    const leagues = loadLeagues();
    const league = leagues[leagueId];
    if (!league) {
      return res.status(404).json({ error: 'הליגה לא נמצאה' });
    }

    if (!league.unsubmittedPlayers) {
      league.unsubmittedPlayers = [];
    }

    const alreadySubmitted = league.members.some(
      (m) => m.memberName.toLowerCase() === cleanName.toLowerCase()
    );
    if (alreadySubmitted) {
      return res.status(400).json({ error: 'שחקן זה כבר הגיש תחזית לליגה' });
    }

    const alreadyListed = league.unsubmittedPlayers.some(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (!alreadyListed) {
      league.unsubmittedPlayers.push({
        id: `unsub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: cleanName,
        joinedAt: new Date().toISOString(),
      });
    }

    leagues[leagueId] = league;
    saveLeagues(leagues);

    res.json({ success: true, league });
  } catch (err: any) {
    console.error('Error adding player:', err);
    res.status(500).json({ error: 'שגיאה בהוספת שחקן לרשימה' });
  }
});

// Serve public assets directly (e.g. /leaders/...)
app.use('/leaders', express.static(path.join(process.cwd(), 'public', 'leaders')));
app.use(express.static(path.join(process.cwd(), 'public')));

// ================= Vite / Static Serving =================

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
