import React, { useState } from 'react';
import { Party } from '../types';

interface LeaderPortraitProps {
  party: Party;
  pollSeats?: number;
  className?: string;
  hideName?: boolean;
}

export function LeaderPortrait({ party, pollSeats, className = '', hideName = false }: LeaderPortraitProps) {
  const [hasError, setHasError] = useState(false);
  return <div className={`leader-portrait ${className}`}>
    <div className="leader-photo">
      {!hasError && party.leaderImageUrl ? <img src={party.leaderImageUrl} alt={party.leader} loading="lazy" onError={() => setHasError(true)}/> : <span className="leader-initials">{party.leader.split(' ').slice(0, 2).map(word => word[0]).join('')}</span>}
      {typeof pollSeats === 'number' && <span className="portrait-seats">{pollSeats} <small>מנדטים</small></span>}
    </div>
    <div className="leader-caption"><strong>{party.name}</strong>{!hideName && <span>{party.leader}</span>}</div>
  </div>;
}
