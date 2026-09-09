'use client';

import { useEffect, useState } from 'react';
import { fetchBranchList, fetchAvailableBMs } from '@/lib/api';
import { apptBranchesFromCrm } from '@/lib/appointments/appt-shared';
import { Field, inputCls } from './inbound-chips';

type RosterState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; items: T[] }
  | { kind: 'failed'; items: T[] };

export default function EcPicker({
  ecName, ecBmName, onChange, disabled,
}: {
  ecName?: string;
  ecBmName?: string;
  onChange: (patch: { ecName?: string; ecBmName?: string }) => void;
  disabled?: boolean;
}) {
  const [ecs, setEcs] = useState<RosterState<string>>({ kind: 'loading' });
  const [bms, setBms] = useState<RosterState<string>>({ kind: 'ready', items: [] });

  useEffect(() => {
    let alive = true;
    fetchBranchList()
      .then((rows) => {
        if (!alive) return;

        if (!Array.isArray(rows)) throw new Error('branch list did not return rows');
        setEcs({ kind: 'ready', items: apptBranchesFromCrm(rows.map((b) => b.name)) });
      })
      .catch((e) => {
        console.error('[b2b] EC roster load failed', e);
        if (alive) setEcs((prev) => ({ kind: 'failed', items: prev.kind === 'loading' ? [] : prev.items }));
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!ecName) { setBms({ kind: 'ready', items: [] }); return; }
    setBms({ kind: 'loading' });
    fetchAvailableBMs([ecName])
      .then((rows) => {
        if (!alive) return;
        if (!Array.isArray(rows)) throw new Error('BM list did not return rows');
        setBms({ kind: 'ready', items: rows.map((r) => r.name).filter(Boolean) });
      })
      .catch((e) => {
        console.error('[b2b] EC BM roster load failed', e);
        if (alive) setBms((prev) => ({ kind: 'failed', items: prev.kind === 'loading' ? [] : prev.items }));
      });
    return () => { alive = false; };
  }, [ecName]);

  const withStored = (items: string[], stored?: string) =>
    (stored && !items.includes(stored) ? [...items, stored] : items);

  const ecOptions = withStored(ecs.kind === 'loading' ? [] : ecs.items, ecName);
  const bmOptions = withStored(bms.kind === 'loading' ? [] : bms.items, ecBmName);

  const hint = (state: RosterState<string>, none: string, loading: string): string | undefined => {
    if (state.kind === 'loading') return loading;
    if (state.kind === 'failed') {
      return state.items.length
        ? 'The roster could not be refreshed — this is the last list that loaded.'
        : 'Could not load the roster. This is a connection problem, not an empty list.';
    }
    return state.items.length ? undefined : none;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="EC name" owner="crm" hint={hint(ecs, 'No Experience Centres listed.', 'Loading Experience Centres…')}>
        <select
          value={ecName || ''}
          disabled={disabled}
          onChange={(e) => onChange({ ecName: e.target.value || undefined, ecBmName: undefined })}
          className={inputCls}
        >
          <option value="">Not assisted at an EC</option>
          {ecOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Field
        label="EC BM name"
        owner="crm"
        hint={!ecName ? 'Pick an EC first' : hint(bms, 'No BMs listed for this EC.', 'Loading BMs…')}
      >
        <select
          value={ecBmName || ''}
          disabled={disabled || !ecName}
          onChange={(e) => onChange({ ecName, ecBmName: e.target.value || undefined })}
          className={inputCls}
        >
          <option value="">—</option>
          {bmOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
    </div>
  );
}
