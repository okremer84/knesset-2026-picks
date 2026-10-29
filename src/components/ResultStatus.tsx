import React from 'react';
import type { Survey, ResultSync } from '../types';
import { formatIsraelTime } from '../utils/israelTime';

export function ResultStatus({ result, sync }: { result: Survey; sync?: ResultSync | null }) {
  const final = result.kind === 'official_results';
  const checked = sync?.lastSuccessAt ?? result.syncedAt;
  const stale = !final && (sync?.status === 'failed' || sync?.stale || !checked || Date.now() - Date.parse(checked) > 600_000);
  return <div className="actual-result-status" aria-live="polite">
    <p><strong>{final ? 'תוצאות סופיות' : 'תוצאות אמת · ספירה חלקית'}</strong>
      {result.countedPercentage != null && <span> · {result.countedPercentage}% מהקולות נספרו</span>}</p>
    {!final && <p>הדירוג זמני ועשוי להשתנות עם המשך הספירה.</p>}
    <p>{result.publishedAt && <>עדכון התוצאות: <time dateTime={result.publishedAt}>{formatIsraelTime(result.publishedAt)}</time> · שעון ישראל</>}</p>
    {result.seatsPublishedAt && <p>חלוקת המנדטים ללא שינוי מאז <time dateTime={result.seatsPublishedAt}>{formatIsraelTime(result.seatsPublishedAt)}</time> · שעון ישראל</p>}
    {checked && <p>בדיקה מוצלחת אחרונה: <time dateTime={checked}>{formatIsraelTime(checked)}</time> · שעון ישראל</p>}
    {!final && <p>בדיקת תוצאות אוטומטית כל 5 דקות</p>}
    {stale && <p className="result-stale" role="status">העדכון מתעכב. מוצגות התוצאות התקינות האחרונות.</p>}
    {result.sourceUrl && <a href={result.sourceUrl} target="_blank" rel="noreferrer">מקור התוצאות · {result.channelOrMedia}</a>}
  </div>;
}
