import React from 'react';
import { groupTickets, money, type Market } from '../lib/campaign';
import { friendlyTitle } from '../lib/marketPresentation';

export function CampaignPicks({ markets, userId, onSelect }: { markets: Market[]; userId: number; onSelect: (market: Market, side?: 'yes' | 'no') => void }) {
  const rows = markets.flatMap(m => groupTickets(m.bets.filter(b => b.user_id === userId)).map(b => ({ m, b })))
    .sort((a, b) => Number(b.b.status === 'pending') - Number(a.b.status === 'pending') || Date.parse(b.b.created_at) - Date.parse(a.b.created_at));
  const pending = rows.filter(r => r.b.status === 'pending');
  return <section className="personal-picks">
    <header><h2>ההימורים שלי</h2><p>{new Set(pending.map(r => `${r.m.id}:${r.b.side}`)).size} הימורים פתוחים · {money(pending.reduce((n, r) => n + r.b.stake, 0))} במשחק</p></header>
    {!rows.length ? <div className="campaign-empty"><h3>עוד לא בחרת צד</h3><p>ההימורים שלך יופיעו כאן, עם הסכום שהשקעת ומה אפשר להרוויח.</p></div> : <div className="personal-bet-list">{rows.map(({ m, b }) => {
      const pending = b.status === 'pending';
      return <article className="personal-bet" key={b.id}>
        <div className="personal-bet-heading"><span className={`personal-bet-side ${b.side}`}>בחרת {b.side === 'yes' ? 'כן' : 'לא'}</span><span className="personal-bet-status">{{ pending: 'ממתין לתוצאה', won: 'זכייה', lost: 'הפסד', refunded: 'בוטל · הוחזר' }[b.status]}</span></div>
        <button className="personal-bet-question" onClick={() => onSelect(m, b.side)}>{friendlyTitle(m)}</button>
        <dl className="personal-bet-amounts">
          <div><dt>סכום ההימור</dt><dd dir="ltr">{money(b.stake)}</dd></div>
          <div><dt>{pending ? 'תשלום אפשרי בזכייה' : b.status === 'refunded' ? 'הסכום שהוחזר' : 'שולם'}</dt><dd dir="ltr">{money(pending ? b.promised_return : b.paid)}</dd></div>
        </dl>
        {pending && <p className="personal-bet-note">התשלום בזכייה כולל את סכום ההימור.</p>}
      </article>;
    })}</div>}
  </section>;
}
