export type MarketType = 'poll_value' | 'poll_movement' | 'channel_activity' | 'mention_count' | 'statement' | 'deadline_event';
export const marketLabels: Record<MarketType, string> = { poll_value: 'סקרים', poll_movement: 'תזוזה בסקרים', channel_activity: 'ברשת', mention_count: 'מילים בקמפיין', statement: 'ראיונות', deadline_event: 'מה יקרה' };
export type Quote = { id: string; probability: number; ai_probability: number | null; version: number; tag: 'no_basis' | 'evidence_based' | 'operator_edited'; origin: string; rationale: string; created_at: string; evidence: unknown[] };
export type Ticket = { id: string; user_id: number; name: string; avatar?: string; side: 'yes' | 'no'; stake: number; promised_return: number; probability: number; paid: number; status: 'pending' | 'won' | 'lost' | 'refunded'; created_at: string; market_id: string };
export type Contract = { source_url: string; yes_rule: string; no_rule: string; void_rule: string; comparison: string; threshold: number; window_starts_at: string; count_rules?: string; subject?: string; pollster?: string; publisher?: string; baseline?: number; source_id?: number; presentation?: { family: 'prime_minister' | 'interview'; key: string; label: string; portrait: string | null }; [key: string]: unknown };
export type Market = { id: string; title: string; type: MarketType; state: 'open' | 'closed' | 'resolved' | 'void'; action: string | null; closes_at: string; window_ends_at: string; contract: Contract; quote: Quote; quotes: Quote[]; bets: Ticket[]; resolution: { action: string; reason?: string; result?: { outcome: string }; preview?: { data: { source_url: string; note: string; observed: number } } } | null };
export type Proposal = { id: string; origin: string; status: string; user_id: number | null; payload: { submitters?: { id: number; name: string }[]; title: string; type?: MarketType; probability?: number; tag?: Quote['tag']; rationale?: string; source_url?: string; external_probability?: number; external_provider?: string; external_rules?: string; external_deadline?: string; note?: string; contract?: Contract; closes_at?: string; window_ends_at?: string; [key: string]: unknown } };
export type OpeningSlateItem = { key: string; title: string; kind: string; probability: number; answers: { id: string; label: string; probability: number }[]; status: string; reason: string | null; market_id: string | null; closes_at: string; window_ends_at: string; contract: Contract };
export type CampaignData = { enabled: boolean; operator: boolean; opening_slate?: OpeningSlateItem[]; wallet: { available: number; outstanding: number; profit: number; entries: { id: number; kind: string; amount: number; created_at: string }[] }; markets: Market[]; proposals: Proposal[]; leaderboard: { user_id: number; name: string; avatar?: string; profit: number; roi: number | null; markets: number; outstanding: number; potential_return?: number; picks?: number; won?: number; lost?: number; win_rate?: number | null }[] };
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ILS', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
export const probability = (bps: number) => `${bps / 100}%`;
export const priceCents = (bps: number, side: 'yes' | 'no') => `${(side === 'yes' ? bps : 10000 - bps) / 100} אג׳`;
export const isMarketOpen = (market: Market, now = Date.now()) => market.state === 'open' && !market.action && Date.parse(market.closes_at) > now;

/** Rank actual recent activity; splitting tickets cannot add participants. */
export function trendingMarkets(markets: Market[], now = Date.now()) {
  return markets.filter(m => isMarketOpen(m, now)).map(market => {
    const tickets = market.bets.filter(b => {
      const time = Date.parse(b.created_at.includes('T') ? b.created_at : b.created_at.replace(' ', 'T') + 'Z');
      return b.status === 'pending' && time > now - 86400000 && time <= now;
    });
    return { market, participants: new Set(tickets.map(b => b.user_id)).size, volume: tickets.reduce((sum, b) => sum + b.stake, 0) };
  }).filter(item => item.participants > 0)
    .sort((a, b) => b.participants - a.participants || b.volume - a.volume || a.market.id.localeCompare(b.market.id));
}
export const returnFor = (stake: number, p: number, side: 'yes' | 'no') => Math.floor(stake * 10000 / (side === 'yes' ? p : 10000 - p));
export function stakeCents(text: string): number { return /^\d+(\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : 0; }

export function groupTickets(tickets: Ticket[]) {
  const groups = new Map<string, Ticket>();
  for (const ticket of tickets) {
    const key = [ticket.market_id, ticket.side, ticket.probability, ticket.status].join(':');
    const group = groups.get(key);
    if (group) { group.stake += ticket.stake; group.promised_return += ticket.promised_return; group.paid += ticket.paid; }
    else groups.set(key, {...ticket});
  }
  return [...groups.values()];
}
