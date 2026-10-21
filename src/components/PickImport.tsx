import React, { useState } from 'react';
import type { SavedPick } from '../types';
import { Dialog } from './Dialog';

export function PickImport({ importablePicks, onImportPick, disabled }: {
  importablePicks: SavedPick[];
  onImportPick: (pick: SavedPick) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [importPickId, setImportPickId] = useState('');
  const source = importablePicks.find(pick => pick.id === importPickId);
  if (!importablePicks.length) return null;
  return <div className="league-pick-import">
    <button type="button" className="import-pick-button" disabled={disabled} onClick={() => {
      if (importablePicks.length === 1) {
        onImportPick(importablePicks[0]);
        return;
      }
      setImportPickId('');
      setOpen(true);
    }}>{importablePicks.length === 1 ? 'העתק את הבחירה מ' + importablePicks[0].leagueName : 'העתק בחירה מליגה אחת'}</button>
    {open && <Dialog open onClose={() => setOpen(false)} label="העתקת בחירה מליגה אחרת" closeOnBackdrop>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault();
        if (disabled || !source) return;
        onImportPick(source);
        setOpen(false);
      }}>
        <h2 className="text-xl font-semibold">העתקת בחירה מליגה אחרת</h2>
        <label className="block text-sm">מאיזו ליגה להעתיק?
          <select aria-label="ליגה להעתקת בחירה" value={source?.id ?? ''} disabled={disabled} onChange={event => setImportPickId(event.target.value)} className="block w-full mt-2 border rounded-lg p-3">
            <option value="">בחירת ליגה</option>
            {importablePicks.map(pick => <option key={pick.id} value={pick.id}>{pick.leagueName}{pick.pickName ? ' · ' + pick.pickName : ''}</option>)}
          </select>
        </label>
        <p className="text-sm text-slate-500">הבחירה תועתק לטיוטה ותוכל לשנות אותה לפני ההגשה. הבחירה בליגה המקורית לא תשתנה.</p>
        <div className="flex gap-3 justify-end">
          <button type="button" className="button-quiet" onClick={() => setOpen(false)}>ביטול</button>
          <button type="submit" className="button-primary" disabled={disabled || !source}>העתק</button>
        </div>
      </form>
    </Dialog>}
  </div>;
}
