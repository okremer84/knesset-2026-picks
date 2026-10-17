import React, { useState } from 'react';
import { ArrowUpLeft, Users } from 'lucide-react';
import { PARTIES_LIST } from '../data/parties';
import { isMarketOpen, probability, type Market } from '../lib/campaign';

function CandidatePortrait({ market }: { market: Market }) {
  const [failed, setFailed] = useState(false);
  const candidate = market.contract.presentation!;
  const party = PARTIES_LIST.find(p => p.id === candidate.portrait);
  return <span className="candidate-avatar">{party?.leaderImageUrl && !failed ? <img src={party.leaderImageUrl} alt="" onError={() => setFailed(true)}/> : <Users size={24}/>}</span>;
}

export function CandidateMarkets({ markets, onSelect }: { markets: Market[]; onSelect: (market: Market, side?: 'yes' | 'no') => void }) {
  const groups = new Map<string, Market[]>();
  for (const market of markets) {
    const key = market.contract.presentation!.key;
    groups.set(key, [...(groups.get(key) ?? []), market]);
  }
  return <>{[...groups.entries()].map(([key, candidates]) => {
    const pm = candidates[0].contract.presentation!.family === 'prime_minister';
    return <article className={`candidate-market ${pm ? 'prime-minister-market' : ''}`} key={key}>
      <div className="candidate-market-heading"><div><span className="market-category">{pm ? 'המרוץ להנהגה' : 'על המסך וברדיו'}</span><h3>{pm ? 'מי יהיה ראש הממשלה הבא?' : 'איפה הריאיון הבא של נתניהו?'}</h3></div><span className="candidate-count">{candidates.length} אפשרויות</span></div>
      <div className="candidate-options">{[...candidates].sort((a, b) => b.quote.probability - a.quote.probability).map(m => <div className="candidate-option" key={m.id}>
        {pm && <CandidatePortrait market={m}/>}
        <button className="candidate-name" onClick={() => onSelect(m)}><strong>{m.contract.presentation!.label}</strong>{m.quote.tag !== 'operator_edited' && <small>{m.quote.tag === 'no_basis' ? 'אין בסיס · 50/50' : 'לפי נתונים'}</small>}</button>
        <strong className="candidate-percent" dir="ltr">{probability(m.quote.probability)}</strong>
        <button className="candidate-buy" disabled={!isMarketOpen(m)} onClick={() => onSelect(m, 'yes')}>{isMarketOpen(m) ? 'קניית כן' : 'סגור'}<ArrowUpLeft size={14}/></button>
        <span className="candidate-meter" style={{ width: `${m.quote.probability / 100}%` }}/>
      </div>)}</div>
      <p className="candidate-disclaimer">כל אפשרות היא שאלת כן/לא נפרדת. האחוזים הם אומדני משחק ועשויים לא להסתכם ב־100%. לחצו על השם לכללים ולקניית לא.</p>
    </article>;
  })}</>;
}
