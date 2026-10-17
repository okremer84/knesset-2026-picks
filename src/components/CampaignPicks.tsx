import React from 'react';
import { groupTickets, money, type Market } from '../lib/campaign';
import { friendlyTitle } from '../lib/marketPresentation';

export function CampaignPicks({ markets, userId, onSelect }: { markets: Market[]; userId: number; onSelect: (market: Market, side?: 'yes'|'no')=>void }) {
  const rows=markets.flatMap(m=>groupTickets(m.bets.filter(b=>b.user_id===userId)).map(b=>({m,b}))).sort((a,b)=>Number(b.b.status==='pending')-Number(a.b.status==='pending')||Date.parse(b.b.created_at)-Date.parse(a.b.created_at));
  const pending=rows.filter(r=>r.b.status==='pending');
  return <section className="personal-picks"><header><h2>הבחירות שלי</h2><p>{new Set(pending.map(r => `${r.m.id}:${r.b.side}`)).size} בחירות פתוחות · {money(pending.reduce((n,r)=>n+r.b.stake,0))} במשחק</p></header>{!rows.length?<div className="campaign-empty"><h3>עוד לא בחרת צד</h3><p>הבחירות שלך וההימורים הפתוחים יופיעו כאן יחד.</p></div>:<div className="scoreboard-table-wrap"><table className="scoreboard-table"><caption>כל הבחירות שלך, הפתוחות קודם</caption><thead><tr><th>השאלה</th><th>הצד שלך</th><th>מצב</th><th>סכום קנייה</th><th>החזר אפשרי / שולם</th><th>רווח והפסד</th></tr></thead><tbody>{rows.map(({m,b})=><tr key={b.id}><th scope="row"><button className="personal-question" onClick={()=>onSelect(m,b.side)}>{friendlyTitle(m)}</button></th><td>{b.side==='yes'?'כן':'לא'}</td><td>{{pending:'פתוח · ממתינים לתוצאה',won:'זכייה',lost:'הפסד',refunded:'הוחזר'}[b.status]}</td><td dir="ltr">{money(b.stake)}</td><td dir="ltr">{money(b.status==='pending'?b.promised_return:b.paid)}</td><td dir="ltr">{b.status==='pending'?'—':money(b.paid-b.stake)}</td></tr>)}</tbody></table></div>}</section>;
}
