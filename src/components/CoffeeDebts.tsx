import React, { useEffect, useRef, useState } from 'react';
import type { CoffeeBet } from './CoffeeView';

type Person = CoffeeBet['creator'];
export function coffeeDebts(bets: CoffeeBet[], playerId: number) {
  const incoming = new Map<number, { person: Person; bets: CoffeeBet[] }>();
  const outgoing = new Map<number, { person: Person; bets: CoffeeBet[] }>();
  for (const bet of bets) {
    if (bet.status !== 'settled' || !bet.opponent || bet.outcome === null) continue;
    const winner = bet.outcome === bet.creatorSide ? bet.creator : bet.opponent;
    const loser = winner.id === bet.creator.id ? bet.opponent : bet.creator;
    if (winner.id !== playerId && loser.id !== playerId) continue;
    const map = winner.id === playerId ? incoming : outgoing;
    const person = winner.id === playerId ? loser : winner;
    const branch = map.get(person.id) || { person, bets: [] };
    branch.bets.push(bet);
    map.set(person.id, branch);
  }
  const sorted = (map: typeof incoming) => [...map.values()].sort((a, b) => b.bets.length - a.bets.length || a.person.name.localeCompare(b.person.name, 'he'));
  return { incoming: sorted(incoming), outgoing: sorted(outgoing) };
}

export function coffeeNetwork(bets: CoffeeBet[]) {
  const people = new Map<number, Person>();
  const links = new Map<string, { from: number; to: number; count: number }>();
  for (const bet of bets) {
    if (bet.status !== 'settled' || !bet.opponent || bet.outcome === null) continue;
    const winner = bet.outcome === bet.creatorSide ? bet.creator : bet.opponent;
    const loser = winner.id === bet.creator.id ? bet.opponent : bet.creator;
    people.set(winner.id, winner);
    people.set(loser.id, loser);
    const key = `${loser.id}:${winner.id}`;
    const link = links.get(key) || { from: loser.id, to: winner.id, count: 0 };
    link.count++;
    links.set(key, link);
  }
  return { people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'he')), links: [...links.values()] };
}

type NetworkSelection = { id: number; side: 'from' | 'to' };

export function CoffeeDebts({ bets, userId }: { bets: CoffeeBet[]; userId: number }) {
  const [selected, setSelected] = useState<NetworkSelection | null>(null);
  const [hover, setHover] = useState<NetworkSelection | null>(null);
  const [focused, setFocused] = useState<NetworkSelection | null>(null);
  const active = hover ?? focused ?? selected;
  const { incoming, outgoing } = coffeeDebts(bets, userId);
  const { people, links } = coffeeNetwork(bets);
  const graphRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(600);
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setGraphWidth(entry.contentRect.width);
    });
    observer.observe(graph);
    return () => observer.disconnect();
  }, [people.length]);
  const height = Math.max(72, people.length * 88 - 16);
  const y = (id: number) => people.findIndex(person => person.id === id) * 88 + 36;
  const route = (link: typeof links[number]) => `M 168 ${y(link.from)} C 260 ${y(link.from)}, 340 ${y(link.to)}, 432 ${y(link.to)}`;
  const lit = (link: typeof links[number]) => active === null || link[active.side] === active.id;
  return <div className="coffee-debts">
    <div className="coffee-debt-totals">
      {([{ title: 'חייבים לך', rows: incoming, style: 'owed', direction: 'מ־' }, { title: 'חייב לאחרים', rows: outgoing, style: 'owe', direction: 'ל־' }]).map(({ title, rows, style, direction }) => <section className={style} key={style} aria-label={title}>
        <span>{title}</span><strong>{rows.reduce((sum, row) => sum + row.bets.length, 0)}</strong><small>מאסטרקפה · {direction}{rows.length} חברים</small>
      </section>)}
    </div>
    <h2>מי חייב למי?</h2>
    {people.length ? <>
      <p className="coffee-network-hint">עברו על שם או הקישו עליו כדי להדגיש את הקשרים שלו.</p>
      <div className="coffee-network" aria-label="רשת החובות של כולם">
        <div className="coffee-network-columns"><b>חייבים</b><b>חייבים להם</b></div>
        <div className="coffee-network-links" ref={graphRef} style={{ height }}>
          <svg viewBox={`0 0 600 ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {links.map(link => <path key={`${link.from}:${link.to}`} d={route(link)} strokeWidth={Math.min(7, 1 + link.count)} opacity={lit(link) ? .8 : .08}/>)}
            {active && links.filter(lit).map(link => <g className="coffee-network-flow" key={`${active.side}:${active.id}:${link.from}:${link.to}`}>
              <animateMotion path={route(link)} dur="1.6s" repeatCount="indefinite" calcMode="paced"/>
              {/* Counter the responsive SVG’s horizontal stretch so the can stays proportional. */}
              <g transform={`scale(${600 / graphWidth} 1)`}><image href="/images/master-coffee-latte.png" x="-20" y="-20" width="40" height="40">
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.88;1" dur="1.6s" repeatCount="indefinite"/>
              </image></g>
            </g>)}
          </svg>
          {(['to', 'from'] as const).map(side => <div className={`coffee-network-nodes ${side}`} key={side}>{people.map(person => {
            const count = links.filter(link => link[side] === person.id).reduce((sum, link) => sum + link.count, 0);
            return <button key={person.id} aria-pressed={selected?.id === person.id && selected.side === side} className={active?.id === person.id && active.side === side ? 'chosen' : ''}
              aria-label={`${person.name}, ${side === 'from' ? 'חייב' : 'חייבים לו'} ${count} מאסטרקפה`}
              onMouseEnter={() => setHover({ id: person.id, side })} onMouseLeave={() => setHover(null)} onFocus={() => setFocused({ id: person.id, side })} onBlur={() => setFocused(null)}
              onClick={() => { setSelected(selected?.id === person.id && selected.side === side ? null : { id: person.id, side }); setHover(null); setFocused(null); }}
              onKeyDown={event => { if (event.key === 'Escape') { setSelected(null); setHover(null); setFocused(null); } }}>
              <span>{person.name}</span><strong>{count}</strong>
            </button>;
          })}</div>)}
        </div>
      </div>
    </> : <p className="coffee-debts-empty">אין עדיין חובות. כאן יופיעו ההתערבויות שהוכרעו.</p>}
  </div>;
}
