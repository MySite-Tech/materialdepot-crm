'use client';

import { SELECTIONS } from '../../../constants/inbound';
import { OutreachLead } from '../../../models/mock-data';
import { Field, SectionCard } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';

export function OutreachRequirementCard({ draft, set, toggleSelection }: {
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  toggleSelection: (s: "Tiles" | "Plywood" | "Laminates" | "Panels" | "Wallpaper" | "Flooring" | "Others") => void;
}) {
  return (
    <SectionCard title="Requirement" owner="crm" subtitle="PRD §3.3">
      <Field label="Selection">
        <div className="flex flex-wrap gap-2">
          {SELECTIONS.map((s) => {
            const active = (draft.selections || []).includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleSelection(s)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${active ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Requirement summary" className="mt-3">
        <textarea value={draft.requirement || ''} onChange={(e) => set('requirement', e.target.value)} rows={3} className={inputCls + ' resize-none'} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <Field
          label="Expected order value (₹)"
          hint="Your estimate at qualification. Reported as an estimate on the Quote Shared tile — never as revenue."
        >
          <input
            type="number"
            min={0}
            value={draft.expectedOrderValue ?? ''}
            onChange={(e) => set('expectedOrderValue', Number(e.target.value) || undefined)}
            className={inputCls}
          />
        </Field>
        <Field label="Expected date of closure" hint="Shown as a column on the Leads tab">
          <input type="date" value={draft.expectedClosure || ''} onChange={(e) => set('expectedClosure', e.target.value)} className={inputCls} />
        </Field>
      </div>
    </SectionCard>
  );
}
