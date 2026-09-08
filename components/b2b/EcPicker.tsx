'use client';

// ── "Assisted at EC" — Experience Centre + that EC's BM ──────────────────────
//
// The Leads Tab PRD asks for these two as dropdowns. EC is an Experience Centre
// (the CRM's branch table — "JP Nagar EC", "Whitefield", …), and the BM list is
// the one Procurement already answers with for that branch, so a name picked
// here is a name the rest of the CRM recognises.
//
// Two roster rules this repo learned the hard way (`SiteAuditOpsView.loadAuditors`):
//
//   A failed load THROWS and is reported as unreadable, never rendered as an
//   empty dropdown. "No ECs" and "the branch API did not answer" send a user to
//   completely different places, and the empty picker blamed the wrong thing
//   for a whole release once already.
//
//   The last good roster survives a later failure, so a network blip cannot
//   blank a working picker while the panel stays open.
//
// A value already stored that is not in the fetched roster is kept as an extra
// option rather than silently reset — a renamed or closed EC must not erase
// what somebody recorded last quarter.

import { useEffect, useState } from 'react';
import { fetchBranchList, fetchAvailableBMs } from '@/lib/mockApi';
import { apptBranchesFromCrm } from '@/lib/appt-shared';
import { Field, inputCls } from './inboundChips';

type RosterState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; items: T[] }
  | { kind: 'failed'; items: T[] };   // items = last good data, possibly empty

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
        // A non-array response is a failed load, not an empty branch table.
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

  /** Options plus whatever is already stored, so a stale value is never lost. */
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
