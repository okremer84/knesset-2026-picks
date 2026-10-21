import React, { useState } from 'react';
import type { SavedPick } from '../types';

export function PickImport({ importablePicks, onImportPick, disabled }: {
  importablePicks: SavedPick[];
  onImportPick: (pick: SavedPick) => void;
  disabled: boolean;
}) {
  const [importPickId, setImportPickId] = useState('');
  const importSource = importablePicks.length === 1 ? importablePicks[0] : importablePicks.find(pick => pick.id === importPickId);
  const importDisabled = disabled;
  if (!importablePicks.length) return null;
  return (
    <div className="league-pick-import">
              {importablePicks.length > 1 && <select aria-label="ליגה לייבוא תחזית" value={importSource?.id ?? ''} disabled={importDisabled} onChange={e => setImportPickId(e.target.value)}>
                <option value="">בחירת ליגה</option>
                {importablePicks.map(pick => <option key={pick.id} value={pick.id}>{pick.leagueName}{pick.pickName ? ' · ' + pick.pickName : ''}</option>)}
              </select>}
              <button type="button" className="import-pick-button" disabled={importDisabled || !importSource} title="ייבוא לטיוטה בלבד. התחזית המקורית לא תשתנה." onClick={() => {
                if (!importSource || importDisabled) return;
                onImportPick(importSource);
                setImportPickId('');
              }}>{importablePicks.length === 1 ? `ייבוא מ־${importablePicks[0].leagueName}` : 'ייבוא'}</button>
            </div>
  );
}
