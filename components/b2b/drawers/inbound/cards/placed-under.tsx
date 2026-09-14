'use client';

import EcPicker from '../../../ui/ec-picker';

import { PLACED_UNDER_FIELDS, PLACED_UNDER_SUBTITLE, PLACED_UNDER_TITLE } from '../../../constants/inbound';
import { ASSIGNABLE_REPS, KAMS } from '../../../models/roster';
import { InboundLead } from '../../../models/mock-data';
import { PlacedUnder } from '../../../types/inbound';
import { Field, SectionCard, inputCls } from '../../../ui/inbound-chips';
import { fetchAvailableBMs } from '@/lib/api';
import { useEffect, useState } from 'react';

type BmRoster =
  | { kind: 'loading' }
  | { kind: 'ready'; names: string[] }
  | { kind: 'failed'; names: string[] };

const META = Object.fromEntries(PLACED_UNDER_FIELDS.map((f) => [f.key, f])) as
  Record<keyof PlacedUnder, typeof PLACED_UNDER_FIELDS[number]>;

/** Keep a stored value selectable even when the roster no longer lists it.
 *
 * These fields were free text for months, so live rows hold names — and
 * spellings — no roster contains. Dropping one from the options would blank the
 * field on the next save without anyone choosing to clear it.
 */
const withStored = (names: string[], stored?: string): string[] =>
  (stored && !names.includes(stored) ? [...names, stored] : names);

export function InboundPlacedUnderCard({ assignKam, draft, kamAssigning, setKam, setPlaced }: {
  assignKam: () => void;
  draft: InboundLead;
  kamAssigning: boolean;
  setKam: (kam: string | undefined) => void;
  setPlaced: (patch: Partial<PlacedUnder>) => void;
}) {
  const [bms, setBms] = useState<BmRoster>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    fetchAvailableBMs()
      .then((rows) => {
        if (!alive) return;
        if (!Array.isArray(rows)) throw new Error('BM list did not return rows');
        setBms({ kind: 'ready', names: [...new Set(rows.map((r) => r.name).filter(Boolean))].sort() });
      })
      .catch((e) => {
        console.error('[b2b] BM roster load failed', e);
        if (alive) setBms((prev) => ({ kind: 'failed', names: prev.kind === 'loading' ? [] : prev.names }));
      });
    return () => { alive = false; };
  }, []);

  const placed = draft.placedUnder || {};
  const isClosed = draft.stage === 'Closed';

  const bmHint = bms.kind === 'loading'
    ? 'Loading BMs…'
    : bms.kind === 'failed'
      ? (bms.names.length
        ? 'The BM list could not be refreshed — this is the last one that loaded.'
        : 'Could not load the BM list. This is a connection problem, not an empty roster.')
      : META.bmName.hint;

  return (
    <SectionCard
      title={PLACED_UNDER_TITLE[draft.stage] || 'Placed under'}
      owner="crm"
      subtitle={PLACED_UNDER_SUBTITLE[draft.stage]}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={META.bmName.label} owner={META.bmName.owner} hint={bmHint}>
          <select
            value={placed.bmName || ''}
            onChange={(e) => setPlaced({ bmName: e.target.value || undefined })}
            className={inputCls}
          >
            <option value="">—</option>
            {withStored(bms.kind === 'loading' ? [] : bms.names, placed.bmName)
              .map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        <Field label={META.spok.label} owner={META.spok.owner} hint={META.spok.hint}>
          <select
            value={placed.spok || ''}
            onChange={(e) => setPlaced({ spok: e.target.value || undefined })}
            className={inputCls}
          >
            <option value="">—</option>
            {withStored(ASSIGNABLE_REPS, placed.spok).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-3">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Assisted at EC</span>
        <EcPicker
          ecName={placed.ecName}
          ecBmName={placed.ecBmName}
          onChange={(patch) => setPlaced({ ecName: patch.ecName, ecBmName: patch.ecBmName })}
        />
      </div>

      {isClosed && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-[11px] font-bold text-gray-700">KAM handoff</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {draft.kam
                  ? <>Assigned to <strong>{draft.kam}</strong>.</>
                  : 'Round-robin over the KAM roster, balanced by how many closed inbound leads each already holds.'}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={draft.kam || ''}
                onChange={(e) => setKam(e.target.value || undefined)}
                className={inputCls + ' w-auto min-w-[150px]'}
              >
                <option value="">Unassigned</option>
                {withStored(KAMS, draft.kam).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <button
                onClick={assignKam}
                disabled={kamAssigning}
                className="shrink-0 bg-[#1A1A1A] text-white px-2.5 py-1.5 rounded-md text-[11px] font-semibold disabled:opacity-50 whitespace-nowrap"
              >
                {kamAssigning ? '…' : 'Auto-assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
