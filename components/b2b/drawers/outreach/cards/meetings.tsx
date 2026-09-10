'use client';

import { KAMS, OutreachLead } from '../../../models/mock-data';
import EcPicker from '../../../ui/ec-picker';
import { Field, SectionCard } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';
import { Dispatch, SetStateAction } from 'react';

export function OutreachMeetingsCard({ assignKam, draft, kamAssigning, kamLoad, set, setDraft }: {
  assignKam: () => Promise<void>;
  draft: OutreachLead;
  kamAssigning: boolean;
  kamLoad: Record<string, number> | null;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  setDraft: Dispatch<SetStateAction<OutreachLead>>;
}) {
  return (
    <SectionCard
      title="Handoff"
      owner="crm"
      subtitle="Round-robin to a KAM once the order is placed"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="KAM">
          <div className="flex items-center gap-1.5">
            <select value={draft.kam || ''} onChange={(e) => set('kam', e.target.value || undefined)} className={inputCls}>
              <option value="">Unassigned</option>
              {KAMS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button
              onClick={assignKam}
              disabled={kamAssigning}
              className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-gray-200 bg-white text-gray-600 whitespace-nowrap disabled:opacity-50 hover:border-[#0F766E] hover:text-[#0F766E]"
            >
              {kamAssigning ? '…' : 'Auto'}
            </button>
          </div>
        </Field>
        <Field label="Spok" hint="Whoever is speaking to this lead — shown on the Leads tab">
          <input value={draft.spok || ''} onChange={(e) => set('spok', e.target.value)} placeholder={draft.bm} className={inputCls} />
        </Field>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Assisted at EC</span>
        <EcPicker
          ecName={draft.ecName}
          ecBmName={draft.ecBmName}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        />
      </div>
      {kamLoad && (
        <p className="text-[10px] text-gray-400 mt-2 leading-snug">
          Rotation picks the KAM holding the fewest closed leads across Inbound and Outreach —
          currently {Object.entries(kamLoad).map(([k, n]) => `${k} ${n}`).join(', ') || 'nobody has any'}.
        </p>
      )}
    </SectionCard>
  );
}
