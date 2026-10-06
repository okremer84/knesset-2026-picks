import React, { useId, useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { israelLocalTime } from '../utils/israelTime';

/** Calendar-only selection with a DD/MM/YYYY button label. */
export function DeadlineInput({ value, onChange, disabled = false, max }: { value: string; onChange: (value: string) => void; disabled?: boolean; max?: string | null }) {
  const id = useId();
  const calendar = useRef<HTMLInputElement>(null);
  const [date = ''] = value.split('T');
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const displayDate = validDate ? date.split('-').reverse().join('/') : date;
  return <div className="deadline-input">
    <label htmlFor={id}>תאריך - ננעל ב20:00 שעון ישראל</label>
    <div className="deadline-calendar-trigger">
      <input ref={calendar} className="deadline-native-calendar" type="date" tabIndex={-1} aria-hidden="true" disabled={disabled}
        min={israelLocalTime(new Date().toISOString()).slice(0, 10)} max={max ? israelLocalTime(max).slice(0, 10) : undefined}
        value={validDate ? date : ''} onChange={e => { if (e.target.value) onChange(`${e.target.value}T20:00`); }}/>
      <button id={id} type="button" aria-label={validDate ? `בחירת תאריך, ${displayDate}` : 'בחירת תאריך'} disabled={disabled} onClick={() => {
        if (calendar.current?.showPicker) calendar.current.showPicker();
        else calendar.current?.click();
      }}><CalendarDays size={18}/><span dir={validDate ? 'ltr' : undefined}>{validDate ? displayDate : 'בחירת תאריך'}</span></button>
    </div>
  </div>;
}
