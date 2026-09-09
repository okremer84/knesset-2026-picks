import React, { useState } from 'react';
import { Party } from '../types';
import { User } from 'lucide-react';

interface LeaderPortraitProps {
  party: Party;
  pollSeats?: number;
  className?: string;
  hideName?: boolean;
}

export const LeaderPortrait: React.FC<LeaderPortraitProps> = ({
  party,
  pollSeats,
  className = '',
  hideName = false,
}) => {
  const [hasError, setHasError] = useState(false);

  // Initials for fallback
  const leaderInitials = party.leader
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

  return (
    <div
      className={`relative w-full aspect-[4/5] bg-gradient-to-b from-slate-800 via-slate-900 to-black overflow-hidden flex flex-col justify-end select-none ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 50% 30%, rgba(59, 130, 246, 0.15) 0%, rgba(15, 23, 42, 0.95) 75%, rgba(0, 0, 0, 1) 100%)',
      }}
    >
      {/* Background subtle glow matching party bloc */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 20%, ${party.color} 0%, transparent 60%)`,
        }}
      />

      {/* Leader Image or Stylized Silhouette */}
      {!hasError && party.leaderImageUrl ? (
        <img
          src={party.leaderImageUrl}
          alt={party.leader}
          className="absolute inset-0 w-full h-full object-cover object-top filter brightness-95 contrast-105 transition-transform duration-300 group-hover:scale-105"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-slate-700/60 flex items-center justify-center shadow-lg mb-2">
            <span className="text-xl font-black text-slate-200">{leaderInitials}</span>
          </div>
          <span className="text-xs font-bold text-slate-300 leading-tight px-1 drop-shadow">
            {party.name}
          </span>
        </div>
      )}

      {/* Bottom vignette overlay */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

      {/* Name bar at the bottom of the image */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-5 pb-2 px-1.5 text-center">
        <div className="text-xs sm:text-sm font-black text-white leading-tight truncate drop-shadow-md">
          {party.name}
        </div>
        {!hideName && (
          <div className="text-[10px] sm:text-[11px] text-slate-300 font-medium truncate drop-shadow mt-0.5">
            {party.leader}
          </div>
        )}
      </div>

      {/* Big Poll Seats count on the chest/portrait if provided */}
      {typeof pollSeats === 'number' && (
        <div className="relative z-20 p-2 text-right">
          <div className="inline-flex items-baseline gap-1">
            <span className="text-3xl sm:text-4xl font-black text-white tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {pollSeats}
            </span>
            <span className="text-[11px] font-bold text-white/80 drop-shadow">
              מנדטים
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
