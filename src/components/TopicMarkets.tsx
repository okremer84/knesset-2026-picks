import React from 'react';
import { isMarketOpen, probability, priceCents, money, type Market } from '../lib/campaign';
import { marketGroup, topic, topicLabels } from '../lib/marketPresentation';
import { formatIsraelTime } from '../utils/israelTime';

export function TopicMarkets({ markets, userId, onSelect }: { markets: Market[]; userId: number; onSelect: (market: Market, side?: 'yes' | 'no') => void }) {
  const groups = new Map<string, Market[]>();
  for (const m of markets) { const g = marketGroup(m); if (g) groups.set(g.key, [...(groups.get(g.key) ?? []), m]); }
  return <>{[...groups].map(([key, rows]) => { const group = marketGroup(rows[0])!;
    return <article className="candidate-market topic-market" key={key}>
      <header className="candidate-market-heading"><div><span className="market-category">{topicLabels[topic(rows[0])]}</span><h3>{group.title}</h3></div><span className="candidate-count">{rows.length} שאלות</span></header>
      <div className="candidate-options">{rows.map(m => { const open = isMarketOpen(m); const stake = m.bets.filter(b => b.user_id === userId && b.status === 'pending').reduce((n, b) => n + b.stake, 0);
        return <div className="topic-option" key={m.id}>
          <button className="candidate-name" onClick={() => onSelect(m)}><strong>{marketGroup(m)!.label}</strong><small>{open ? 'פתוח' : m.state === 'resolved' ? 'הוכרע' : m.state === 'void' ? 'בוטל' : 'ממתינים לתוצאה'}{stake > 0 ? ` · ${money(stake)} שלך` : ''}</small></button>
          <strong className="candidate-percent" dir="ltr">{probability(m.quote.probability)}</strong>
          <div className="topic-choices"><button className="choice-yes" disabled={!open} onClick={() => onSelect(m, 'yes')}>כן <span>{priceCents(m.quote.probability, 'yes')}</span></button><button className="choice-no" disabled={!open} onClick={() => onSelect(m, 'no')}>לא <span>{priceCents(m.quote.probability, 'no')}</span></button></div>
        </div>;
      })}</div><footer className="candidate-disclaimer">{group.note}<br/>הקנייה נסגרת ב־{formatIsraelTime(rows[0].closes_at)} · לחצו על השאלה לפרטים ולכללי ההכרעה.</footer>
    </article>;
  })}</>;
}
