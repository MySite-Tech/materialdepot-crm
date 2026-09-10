'use client';

import { SELECTIONS } from '../../../constants/inbound';
import { InboundLead } from '../../../models/mock-data';
import { Field, SectionCard } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';

export function InboundRequirementCard({ draft, droppedSelections, set }: {
  draft: InboundLead;
  droppedSelections: string[];
  set: <K extends keyof InboundLead>(k: K, v: InboundLead[K]) => void;
}) {
  return (
    <SectionCard title="Requirement" owner="kylas-write" subtitle="§3.3 — Requirement summary and Selection sync to Kylas">
      <Field label="Selection">
        <div className="flex flex-wrap gap-1.5">
          {SELECTIONS.map((c) => {
            const active = (draft.selections || []).includes(c);
            return (
              <button
                key={c}
                onClick={() => set('selections', active
                  ? (draft.selections || []).filter((x) => x !== c)
                  : [...(draft.selections || []), c])}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  active
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
        {droppedSelections.length > 0 && (
          <p className="text-[10px] text-amber-700 mt-1.5 leading-snug">
            {droppedSelections.join(', ')} has no option in the Kylas picklist, so it is stored
            in the CRM only and will not appear in Kylas.
          </p>
        )}
      </Field>
      <Field label="Requirement summary" className="mt-3">
        <textarea
          value={draft.requirement || ''}
          onChange={(e) => set('requirement', e.target.value)}
          rows={3}
          placeholder="What the client actually needs — quantities, sizes, sites."
          className={inputCls + ' resize-none'}
        />
      </Field>
      <Field
        label="Expected order value"
        className="mt-3 sm:max-w-[260px]"
        hint="Your estimate at qualification. Not the PI or the order figure — those come from the deal ticket."
      >
        <input
          type="number"
          min={0}
          value={draft.expectedOrderValue || ''}
          onChange={(e) => set('expectedOrderValue', Number(e.target.value) || 0)}
          placeholder="₹"
          className={inputCls}
        />
      </Field>
    </SectionCard>
  );
}
