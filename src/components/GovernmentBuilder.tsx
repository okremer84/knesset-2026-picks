import React, { useState } from 'react';
import type { Prediction } from '../types';
import { PARTIES_LIST } from '../data/parties';

export function GovernmentBuilder({ predictions }: { predictions: Prediction[] }) {
  const [pickId, setPickId] = useState(predictions[0]?.id ?? '');
  const [governments, setGovernments] = useState<Record<string, string[]>>({});
  const pick = predictions.find(p => p.id === pickId) ?? predictions[0];
  if (!pick) return <p>עדיין אין תחזיות להרכבת ממשלה.</p>;
  const parties = PARTIES_LIST.filter(p => p.id !== 'balad').sort((a, b) =>
    (pick.seats[b.id] ?? 0) - (pick.seats[a.id] ?? 0) || a.name.localeCompare(b.name, 'he'));
  const selected = governments[pick.id] ?? [];
  const seats = parties.reduce((sum, party) => sum + (selected.includes(party.id) ? pick.seats[party.id] ?? 0 : 0), 0);
  const members = parties.filter(p => selected.includes(p.id) && (pick.seats[p.id] ?? 0) > 0);
  const setParties = (ids: string[]) => setGovernments(current => ({ ...current, [pick.id]: ids }));
  function toggle(id: string) {
    setParties(selected.includes(id) ? selected.filter(p => p !== id) : [...selected, id]);
  }
  return <section className="government-builder" aria-label="הרכבת ממשלה">
    <header><h2>בונים ממשלה</h2><p>בחרו תחזית והזמינו מפלגות לשולחן. מי יביא את המנדט ה־61?</p></header>
    <label className="government-pick">על בסיס התחזית של
      <select value={pick.id} onChange={event => setPickId(event.target.value)}>
        {predictions.map(p => <option key={p.id} value={p.id}>{p.memberName}{p.pickName ? ` · ${p.pickName}` : ''}</option>)}
      </select>
    </label>
    <div className="government-workspace">
      <div>
        <h3>המפלגות בכנסת</h3>
        <div className="government-parties">{parties.map(party => {
          const count = pick.seats[party.id] ?? 0;
          const chosen = selected.includes(party.id) && count > 0;
          return <button key={party.id} disabled={count <= 0} aria-pressed={chosen} onClick={() => toggle(party.id)}>
            <span>{chosen ? '✓ ' : '+ '}{party.name}</span><strong>{count}</strong>
          </button>;
        })}</div>
      </div>
      <aside className="government-result">
        <h3>הממשלה שלכם</h3>
        <div className="government-seat-count" aria-live="polite"><strong>{seats}</strong><span>מנדטים</span>
          <p>{seats >= 61 ? 'יש ממשלה! יש לכם רוב בכנסת' : `עוד ${61 - seats} מנדטים לרוב`}</p>
        </div>
        <progress aria-label="התקדמות לרוב של 61 מנדטים" max={61} value={Math.min(61, seats)}/>
        <p className="government-note">רוב של 61 מנדטים לפי התחזית שנבחרה</p>
        {members.length ? <ul>{members.map(party => <li key={party.id}><span>{party.name}</span><span>{pick.seats[party.id]} מנדטים</span><button aria-label={`הסרת ${party.name} מהממשלה`} onClick={() => toggle(party.id)}>×</button></li>)}</ul> : <p className="government-empty">השולחן עוד ריק. בחרו מפלגה כדי להתחיל.</p>}
        <button className="button-quiet" disabled={!selected.length} onClick={() => setParties([])}>מתחילים מחדש</button>
      </aside>
    </div>
  </section>;
}
