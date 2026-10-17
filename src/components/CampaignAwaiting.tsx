import React from 'react';
import type { OpeningSlateItem } from '../lib/campaign';

export function CampaignAwaiting({ questions }: { questions: OpeningSlateItem[] }) {
  const pending = questions.filter(q => !q.market_id);
  if (!pending.length) return null;
  return <section className="campaign-awaiting" aria-label="שאלות שממתינות לפתיחה"><details><summary>עוד {pending.length} שאלות אמיתיות שממתינות לפתיחה</summary><p>שאלות X וחדשות ייפתחו אחרי בדיקת המקורות והסיכויים. אי אפשר לקנות אותן בינתיים.</p><div className="market-grid">{pending.map(q => <article className="market-card" key={q.key}><span className="market-category">{q.status === 'expired' ? 'חלון ההצטרפות הסתיים' : 'ממתינים לפתיחה'}</span><h3 className="market-question">{q.title}</h3><p>{q.reason}</p><p className="campaign-muted">תשובות: כן / לא · טרם תומחר</p><details><summary>מה ייחשב כן, לא או ביטול?</summary><p><strong>כן:</strong> {q.contract.yes_rule}</p><p><strong>לא:</strong> {q.contract.no_rule}</p><p><strong>החזר:</strong> {q.contract.void_rule}</p><a href={q.contract.source_url} target="_blank" rel="noreferrer">מקור ההכרעה</a></details></article>)}</div></details></section>;
}
