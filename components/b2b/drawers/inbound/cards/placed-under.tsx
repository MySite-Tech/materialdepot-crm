'use client';

import EcPicker from '../../../ui/ec-picker';

import { PLACED_UNDER_FIELDS, PLACED_UNDER_SUBTITLE, PLACED_UNDER_TITLE } from '../../../constants/inbound';
import { ASSIGNABLE_REPS } from '../../../models/roster';
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

const withStored = (names: string[], stored?: string): string[] =>
  (stored && !names.includes(stored) ? [...names, stored] : names);

export function InboundPlacedUnderCard({ draft, setPlaced }: {
  draft: InboundLead;
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

    </SectionCard>
  );
}
