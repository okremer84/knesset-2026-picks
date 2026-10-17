import React from 'react';
import { ArrowUpLeft, Flame } from 'lucide-react';
import { marketLabels, probability, trendingMarkets, type Market } from '../lib/campaign';

export function CampaignTrending({ markets, onSelect, onShowAll }: { markets: Market[]; onSelect: (market: Market) => void; onShowAll: () => void }) {
  const trending = trendingMarkets(markets);
  return <aside className="campaign-trending" aria-label="חם עכשיו">
    <button className="trending-heading" onClick={onShowAll}><span><Flame size={17}/>חם עכשיו</span><ArrowUpLeft size={16}/></button>
    {trending.length ? <div className="trending-list">{trending.slice(0, 3).map(({ market, participants }) => {
      const previous = [...market.quotes].filter(q => q.version < market.quote.version).sort((a, b) => b.version - a.version)[0];
      const change = previous ? (market.quote.probability - previous.probability) / 100 : null;
      return <button key={market.id} className="trending-market" onClick={() => onSelect(market)}>
        <span className="trending-question">{market.title}<small>{marketLabels[market.type]} · {participants === 1 ? 'משתתף אחד' : `${participants} משתתפים`}</small></span>
        <span className="trending-price"><strong dir="ltr">{probability(market.quote.probability)}</strong><small className={change !== null && change > 0 ? 'positive' : change !== null && change < 0 ? 'negative' : ''} title="שינוי בנקודות אחוז לעומת המחיר הקודם" aria-label={change === null ? 'אין מחיר קודם להשוואה' : change === 0 ? 'ללא שינוי במחיר' : `${change > 0 ? 'עלייה' : 'ירידה'} של ${Math.abs(change)} נקודות אחוז מהמחיר הקודם`}>{change ? <><span aria-hidden="true">{change > 0 ? '▲' : '▼'}</span> {Math.abs(change)} נק׳</> : '—'}</small></span>
      </button>;
    })}</div> : <p className="trending-empty">עוד אין פעילות ב־24 השעות האחרונות.<br/>הקנייה הראשונה תתחיל את השיחה.</p>}
    <p className="trending-caption">לפי משתתפים ב־24 שעות · שינוי מול המחיר הקודם</p>
  </aside>;
}
