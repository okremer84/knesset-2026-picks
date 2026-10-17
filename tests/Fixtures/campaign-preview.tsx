/// <reference types="vite/client" />
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CampaignBoard, type CampaignAction } from '../../src/components/CampaignView';
import { returnFor, type CampaignData, type Market, type MarketType } from '../../src/lib/campaign';
import '../../src/index.css';
import '../../src/campaign.css';

const iso = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
const definitions: [string, MarketType, number, number[]][] = [
  ['איראן תוזכר לפחות 3 פעמים בתשדיר הבא של הליכוד?', 'mention_count', 5000, [5000]],
  ['הליכוד יעלה בסקר הבא של חדשות 12?', 'poll_movement', 6200, [5000, 5400, 5100, 5800, 6200]],
  ['קטאר תעלה בראיון הבא של לפיד?', 'statement', 5000, [5000]],
  ['המחנה הממלכתי יקבל לפחות 10 מנדטים בסקר הבא?', 'poll_value', 3800, [4500, 4200, 4800, 4300, 3800]],
  ['סרטון חדש בערוץ הליכוד עד שישי ב־18:00?', 'channel_activity', 7400, [6100, 6400, 6300, 6900, 7400]],
  ['מפלגה תודיע על פרישה מהמרוץ עד יום ראשון?', 'deadline_event', 2300, [3000, 2800, 3200, 2500, 2300]],
];
const markets: Market[] = definitions.map(([title, type, p, history], i) => {
  const quotes = history.map((probability, v) => ({ id: `q-${i}-${v}`, probability, ai_probability: probability, version: v + 1, tag: p === 5000 ? 'no_basis' as const : 'evidence_based' as const, origin: 'ai', rationale: p === 5000 ? 'אין מספיק חומר קודם להשוואה. מתחילים מחמישים־חמישים.' : 'הערכה לדוגמה לפי פרסומים קודמים. נתונים אלה מיועדים לתצוגת הפיתוח בלבד.', created_at: iso(-5 + v), evidence: [] }));
  return { id: `market-${i}`, title, type, state: 'open', action: null, closes_at: iso(i < 3 ? 5 + i : 30 + i), window_ends_at: iso(48), contract: { source_url: 'https://example.org/demo-source', yes_rule: 'לפחות שלושה אזכורים של איראן בתשדיר הרשמי הראשון שיפורסם בחלון שנקבע.', no_rule: 'התשדיר פורסם וכולל פחות משלושה אזכורים.', void_rule: 'לא פורסם תשדיר מתאים בחלון, או שלא ניתן לצפות בו.', comparison: 'gte', threshold: 3, window_starts_at: iso(0), count_rules: 'שמע בלבד. איראן, באיראן, מאיראן. כל חזרה נספרת; כתוביות אינן נספרות בנפרד.' }, quote: quotes.at(-1)!, quotes, bets: Array.from({length: [3, 4, 0, 2, 0, 0][i]}, (_, j) => ({id: `demo-ticket-${i}-${j}`, market_id: `market-${i}`, user_id: j + 2, name: ['דנה', 'נועם', 'מאיה', 'איתי'][j], side: j % 2 ? 'no' as const : 'yes' as const, stake: 2500, promised_return: returnFor(2500, p, j % 2 ? 'no' : 'yes'), probability: p, paid: 0, status: 'pending' as const, created_at: iso(-1 - j)})), resolution: null };
});
const initial: CampaignData = { enabled: true, operator: new URLSearchParams(window.location.search).get('role') === 'operator', wallet: { available: 1000000, outstanding: 0, profit: 0, entries: [{id: 1, kind: 'grant', amount: 1000000, created_at: iso(-10)}] }, markets, proposals: [], leaderboard: [{ user_id: 1, name: 'עומר', profit: 0, roi: null, markets: 0, outstanding: 0 }, { user_id: 2, name: 'דנה', profit: 0, roi: null, markets: 0, outstanding: markets.flatMap(m => m.bets).filter(b => b.user_id === 2).reduce((sum, b) => sum + b.stake, 0) }] };
function Preview() {
  const [data, setData] = useState(initial);
  const [monitorDone, setMonitorDone] = useState(false);
  const action: CampaignAction = async <T,>(path: string, body?: unknown): Promise<T> => {
    const b = body as { side: 'yes' | 'no'; stake: number; quote_id: string; title?: string; note?: string };
    if (path === '/monitoring') return {x_configured:false, sources:[{id:1,kind:'news',name:'ynet · מקור לדוגמה',items:1,last_run:{status:'ok',finished_at:'2026-10-15 10:00:00',message:'נתוני הדגמה בלבד'}}], packets: monitorDone ? [] : [{market_id:'monitor-demo',title:'דוגמה: האם יופיע דיווח חדש שעומד בתנאי השאלה?',mode:'news_reporting',status:'review',message:'בדקו את הכתבה והאם היא מוסיפה תוכן חדש.',version:'demo-v1',coverage:[{id:1,name:'מקור לדוגמה',complete:true,message:'תצוגת דוגמה בלבד — אין איסוף חי בתצוגה הזאת'}],baseline:[],items:[{id:1,url:'https://example.org/demo-article',title:'כתבת דוגמה לבדיקת מסך האישור',text:'זהו טקסט הדגמה בלבד. באפליקציה המחוברת לשרת יוצגו כאן הטקסט שנאסף, קישור לכתבה ומועד פרסומה. הטקסט הזה אינו דיווח חדשותי.',published_at:iso(-1),dismissed:false,metadata:{readable:true}}]}]} as T;
    if (path.endsWith('/monitor-preview')) return {token:'demo-only',outcome:'yes',payout:25000,refund:0} as T;
    if (path === '/markets/monitor-demo/settle' || path === '/markets/monitor-demo/void' || path === '/markets/monitor-demo/monitor-dismiss') { setMonitorDone(true); return {ok:true} as T; }
    if (path.endsWith('/bets')) {
      const id = path.split('/')[2]; const market = data.markets.find(m => m.id === id)!;
      if (b.stake > data.wallet.available) throw new Error('אין מספיק כסף פנוי');
      const ticket = { id: crypto.randomUUID(), market_id: id, user_id: 1, name: 'עומר', side: b.side, stake: b.stake, promised_return: returnFor(b.stake, market.quote.probability, b.side), probability: market.quote.probability, paid: 0, status: 'pending' as const, created_at: iso(0) };
      setData(prev => ({ ...prev, wallet: {...prev.wallet, available: prev.wallet.available - b.stake, outstanding: prev.wallet.outstanding + b.stake}, markets: prev.markets.map(m => m.id === id ? {...m, bets: [...m.bets, ticket]} : m) }));
      return { bet: ticket } as T;
    }
    if (path === '/suggestions') { setData(prev => ({...prev, proposals: [...prev.proposals, {id: crypto.randomUUID(), origin: 'member', user_id: 1, status: 'pending', payload: {title: b.title!, note: b.note}}]})); return {ok: true} as T; }
    throw new Error('תצוגת פיתוח בלבד. ניהול וייבוא זמינים באפליקציה המחוברת לשרת.');
  };
  return <div className="campaign-surface" style={{minHeight:'100vh'}}><div style={{background:'#eff5f0',fontSize:12,textAlign:'center',padding:8}}>תצוגת פיתוח · נתוני דוגמה · פעולות נשמרות בדפדפן עד הרענון בלבד</div><div style={{maxWidth:1200,margin:'auto',padding:'22px 28px',display:'flex',justifyContent:'space-between',borderBottom:'1px solid #ecefec',alignItems:'center'}}><strong style={{fontSize:23,letterSpacing:-1}}>כנסת <span style={{color:'#0b9254'}}>2026</span></strong><span style={{fontSize:14,color:'#0b9254',fontWeight:600}}>אייזנמארקט</span><span style={{borderRadius:'50%',background:'#edf2ee',width:35,height:35,display:'grid',placeItems:'center'}}>ע</span></div><main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8"><CampaignBoard data={data} userId={1} leagueName="הליגה של החברים" onAction={action} onRefresh={async () => {}}/></main></div>;
}
const previewRoot = createRoot(document.getElementById('root')!);
previewRoot.render(<Preview/>);
if (import.meta.hot) import.meta.hot.dispose(() => previewRoot.unmount());
