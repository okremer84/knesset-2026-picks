import React, { useEffect, useMemo, useState } from 'react';
import type { Survey } from '../types';
import { PARTIES_LIST } from '../data/parties';

// Chart colors are distinct from party branding, which contains many similar blues.
const CHART_COLORS = ['#0072b2', '#d55e00', '#009e73', '#a23b9c', '#8c6510', '#3647b5', '#c42c52', '#47751b', '#705348', '#00838f', '#6f42c1', '#b34d00', '#4d6475', '#a06b82', '#333333'];
const chartColor = (id: string) => CHART_COLORS[PARTIES_LIST.findIndex(p => p.id === id) % CHART_COLORS.length];
const day = (date: string) => Date.parse(`${date}T12:00:00Z`);
const shortDate = (date: string) => new Date(day(date)).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
const PARTY_SELECTION_KEY = 'knesset_fantasy_poll_trend_parties';
const DEFAULT_PARTY_IDS = ['yashar', 'likud', 'beyachad', 'democrats', 'utj', 'shas', 'israel_beitenu', 'otzma_yehudit'];

function readPartySelection(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PARTY_SELECTION_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.every(id => typeof id === 'string')) {
      return PARTIES_LIST.filter(p => saved.includes(p.id)).map(p => p.id);
    }
  } catch {
    // Storage may be unavailable or contain an invalid value.
  }
  return DEFAULT_PARTY_IDS;
}

export function PollTrendChart({ surveys, selectedChannel }: { surveys: Survey[]; selectedChannel?: string }) {
  const [partyIds, setPartyIds] = useState<string[]>(readPartySelection);
  useEffect(() => {
    try {
      localStorage.setItem(PARTY_SELECTION_KEY, JSON.stringify(partyIds));
    } catch {
      // Keep the chart usable when browser storage is blocked or full.
    }
  }, [partyIds]);
  const selectedParties = PARTIES_LIST.filter(p => partyIds.includes(p.id));
  const [hovered, setHovered] = useState<string | null>(null);
  const channel = selectedChannel ?? surveys[0]?.channelOrMedia;
  const channelPolls = useMemo(() => surveys.filter(s => s.channelOrMedia === channel), [surveys, channel]);
  const reported = selectedParties.flatMap(party => channelPolls.filter(s => Object.hasOwn(s.seats, party.id)).map(poll => ({ party, poll, key: `${party.id}:${poll.id}` })));
  const dates = [...new Set(channelPolls.map(s => s.date))].sort();
  if (!dates.length) return null;
  const start = day(dates[0]), end = day(dates[dates.length - 1]);
  const max = Math.max(5, Math.ceil(Math.max(0, ...reported.map(({party, poll}) => poll.seats[party.id])) / 5) * 5);
  const x = (date: string) => end === start ? 440 : 55 + (day(date) - start) / (end - start) * 790;
  const y = (seats: number) => 270 - seats / max * 230;
  const focused = reported.find(s => s.key === hovered);
  const ticks = [...new Set([dates[0], dates[Math.floor((dates.length - 1) / 2)], dates[dates.length - 1]])];
  return <section className="poll-trends">
    <div className="poll-trends-heading"><div><h2>המגמה לאורך זמן</h2><p>{channel} · כל הסקרים הזמינים · {shortDate(dates[0])}–{shortDate(dates[dates.length - 1])}</p></div>
    </div>
    <fieldset className="poll-party-checkboxes"><legend>מפלגות בגרף</legend>
      {PARTIES_LIST.map(p => <label key={p.id}><input type="checkbox" checked={partyIds.includes(p.id)} onChange={e => { setPartyIds(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id)); setHovered(null); }} style={{accentColor: chartColor(p.id)}}/><span className="poll-party-color" style={{background: chartColor(p.id)}}/>{p.name}</label>)}
    </fieldset>
    {!partyIds.length ? <p className="poll-chart-readout">סמנו מפלגות כדי להציג את המגמות שלהן.</p> : !reported.length ? <p>אין נתונים מדווחים למפלגות שבחרתם בסקרים הזמינים.</p> : <>
      <div className="poll-chart-scroll"><svg viewBox="0 0 890 315" role="img" aria-label={`מגמת המנדטים של ${selectedParties.map(p => p.name).join(', ')} — ${channel}`}>
        <text x="55" y="18" fontSize="12" fill="#6b7067">מנדטים</text>
        {Array.from({ length: 6 }, (_, i) => max * i / 5).map(value => <g key={value}><line x1="55" x2="845" y1={y(value)} y2={y(value)} stroke="#e4e4dc"/><text x="42" y={y(value) + 4} textAnchor="end" fontSize="12" fill="#6b7067">{Number(value.toFixed(1))}</text></g>)}
        {ticks.map(date => <text key={date} x={x(date)} y="302" textAnchor="middle" fontSize="12" fill="#6b7067">{shortDate(date)}</text>)}
        {selectedParties.map(party => {
          const polls = [...channelPolls].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
          let gap = true;
          const path = polls.map(p => { if (!Object.hasOwn(p.seats, party.id)) { gap = true; return ''; } const command = gap ? 'M' : 'L'; gap = false; return `${command}${x(p.date)},${y(p.seats[party.id])}`; }).join(' ');
          return <g key={`${party.id}:${channel}`}><path d={path} stroke={chartColor(party.id)} strokeWidth={3} fill="none" opacity={0.85}/>
            {polls.filter(p => Object.hasOwn(p.seats, party.id)).map(p => {
              const key = `${party.id}:${p.id}`;
              const description = `${party.name} · ${channel} · ${p.date} · ${p.seats[party.id]} מנדטים`;
              return <circle key={key} cx={x(p.date)} cy={y(p.seats[party.id])} r={hovered === key ? 6 : 4} fill={chartColor(party.id)} stroke="white" strokeWidth="1" tabIndex={0} aria-label={description} onFocus={() => setHovered(key)} onBlur={() => setHovered(null)} onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)} onClick={() => setHovered(key)}><title>{description}</title></circle>;
            })}
          </g>;
        })}
      </svg></div>
      <p className="poll-chart-readout" aria-live="polite">{focused ? `${focused.party.name} · ${focused.poll.channelOrMedia} · ${focused.poll.institute} · ${shortDate(focused.poll.date)} · ${focused.poll.seats[focused.party.id]} מנדטים` : 'כל קו מייצג מפלגה · בחרו נקודה לפרטי הסקר'}</p>
      <ul className="poll-chart-legend">{selectedParties.filter(party => reported.some(r => r.party.id === party.id)).map(party => <li key={party.id}><span style={{background: chartColor(party.id)}}/>{party.name}</li>)}</ul>
      <details className="poll-chart-data"><summary>נתוני הגרף בטבלה</summary><table><thead><tr><th>תאריך</th><th>מפלגה</th><th>ערוץ</th><th>מנדטים</th></tr></thead><tbody>{[...reported].sort((a,b) => b.poll.date.localeCompare(a.poll.date)).map(({key, party, poll}) => <tr key={key}><td>{poll.date}</td><td>{party.name}</td><td>{poll.channelOrMedia}</td><td>{poll.seats[party.id]}</td></tr>)}</tbody></table></details>
    </>}
  </section>;
}
