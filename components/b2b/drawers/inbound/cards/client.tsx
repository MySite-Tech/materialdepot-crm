'use client';

import { CLIENT_TYPES, INBOUND_LOCATIONS, LEAD_TYPES, PRIORITIES, SEGMENTS, SELECTIONS } from '../../../constants/inbound';
import { InboundLead } from '../../../models/mock-data';
import { ContactPerson } from '../../../types/inbound';
import { Field, SectionCard } from '../../../ui/inbound-chips';
import { RoleOptions } from '../../../ui/outreach-chips';
import { RequirementHistory } from '../../../ui/requirement-history';
import { inputCls } from '../../../constants/ui';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 10);

const label = 'text-[11.5px] font-medium text-gray-500';

type Set = <K extends keyof InboundLead>(k: K, v: InboundLead[K]) => void;

function Choice<V extends string>({ label: l, value, options, show = (o: V) => o, onChange, info }: {
  label: string;
  value?: V;
  options: readonly V[];
  show?: (o: V) => string;
  onChange: (v: V | undefined) => void;
  info?: string;
}) {
  return (
    <Field label={l} info={info}>
      <select value={value || ''} onChange={(e) => onChange((e.target.value || undefined) as V | undefined)} className={inputCls}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{show(o)}</option>)}
      </select>
    </Field>
  );
}

function People({ draft, set }: { draft: InboundLead; set: Set }) {
  const extra = draft.additionalContacts || [];
  const setExtra = (next: ContactPerson[]) => set('additionalContacts', next);
  const patch = (i: number, p: Partial<ContactPerson>) => setExtra(extra.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const row = 'grid grid-cols-[1fr_1fr_1fr_20px] gap-2 items-center';
  return (
    <div className="flex flex-col gap-1.5">
      <RoleOptions id="inbound-contact-roles" />
      <div className={row}>
        <span className={label}>People at the firm</span>
        <span className={label}>Designation</span>
        <span className={label}>Mobile</span>
        <span />
      </div>
      <div className={row}>
        <input value={draft.primaryContactName || ''} onChange={(e) => set('primaryContactName', e.target.value)}
          placeholder={draft.contactName || 'Who you spoke to'} aria-label="Primary person" className={inputCls} />
        <input value={draft.primaryContactRole || ''} onChange={(e) => set('primaryContactRole', e.target.value)}
          list="inbound-contact-roles" placeholder="e.g. Owner" aria-label="Primary person's designation" className={inputCls} />
        <input inputMode="numeric" value={draft.primaryContactPhone || ''} onChange={(e) => set('primaryContactPhone', digits(e.target.value))}
          placeholder={draft.phone || '10-digit mobile'} aria-label="Primary person's mobile" className={inputCls} />
        <span />
      </div>
      {extra.map((c, i) => (
        <div key={i} className={row}>
          <input value={c.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label={`Person ${i + 2}`} className={inputCls} />
          <input value={c.role || ''} onChange={(e) => patch(i, { role: e.target.value })} list="inbound-contact-roles" aria-label={`Person ${i + 2} designation`} className={inputCls} />
          <input inputMode="numeric" value={c.phone} onChange={(e) => patch(i, { phone: digits(e.target.value) })} aria-label={`Person ${i + 2} mobile`} className={inputCls} />
          <button onClick={() => setExtra(extra.filter((_, j) => j !== i))} aria-label="Remove person" className="text-gray-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      ))}
      <button onClick={() => setExtra([...extra, { name: '', phone: '' }])} className="self-start text-[12px] font-medium text-[#0F766E] hover:underline">
        + Add another person
      </button>
    </div>
  );
}

export function InboundClientCard({ draft, presalesTypeUnmapped, set }: {
  draft: InboundLead;
  presalesTypeUnmapped: boolean;
  set: Set;
}) {
  const selections = draft.selections || [];
  return (
    <>
      <SectionCard title="Client" info="Filled by Inbound. Everything here travels to Outreach and the KAM.">
        <div className="flex flex-col gap-3">
          <Field label="Company name" info="The real company. Kylas often ships the phone number in the name field.">
            <input value={draft.companyName || ''} onChange={(e) => set('companyName', e.target.value)} placeholder="e.g. Sundaram Interiors" className={inputCls} />
          </Field>
          <People draft={draft} set={set} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2.5 gap-y-2.5">
            <Choice label="Client type" value={draft.clientType} options={CLIENT_TYPES} onChange={(v) => set('clientType', v)}
              info={presalesTypeUnmapped ? `Presales recorded "${draft.presalesClientType}", which maps to no single value here.` : undefined} />
            <Choice label="Lead type" value={draft.leadType} options={LEAD_TYPES} onChange={(v) => set('leadType', v)} />
            <Choice label="Priority" value={draft.priority} options={PRIORITIES} onChange={(v) => set('priority', v)} />
            <Choice label="Segment" value={draft.segment} options={SEGMENTS} show={(s) => `Segment ${s}`} onChange={(v) => set('segment', v)} />
            <Choice label="City" value={draft.location} options={INBOUND_LOCATIONS} onChange={(v) => set('location', v)}
              info={draft.pincode ? `Defaulted from pincode ${draft.pincode}.` : 'No pincode from Presales, so set it yourself.'} />
            <Field label="GST number" info="Optional for Inbound.">
              <input value={draft.gstNumber || ''} onChange={(e) => set('gstNumber', e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" className={inputCls} />
            </Field>
          </div>
          <Field label="Office address" info="Optional. Where their office or studio is. The firm record keeps it.">
            <input value={draft.officeLocation || ''} onChange={(e) => set('officeLocation', e.target.value)} placeholder="e.g. 2nd floor, 14 Main Rd, Indiranagar" className={inputCls} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Requirement" info="What the client needs, kept in the CRM. Earlier versions of the summary are kept below it.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Selection">
            {SELECTIONS.map((c) => {
              const on = selections.includes(c);
              return (
                <button
                  key={c}
                  aria-pressed={on}
                  onClick={() => set('selections', on ? selections.filter((x) => x !== c) : [...selections, c])}
                  className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${on ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <Field label="Summary">
            <textarea value={draft.requirement || ''} onChange={(e) => set('requirement', e.target.value)} rows={3}
              placeholder="Quantities, sizes, sites, timeline" className={inputCls + ' resize-none'} />
            <RequirementHistory history={draft.requirementHistory} />
          </Field>
          <Field label="Expected order value" className="sm:max-w-[220px]" info="Your estimate at qualification. Not the PI or order figure, which come from the deal ticket.">
            <input type="number" min={0} value={draft.expectedOrderValue || ''} onChange={(e) => set('expectedOrderValue', Number(e.target.value) || 0)} placeholder="₹" className={inputCls} />
          </Field>
        </div>
      </SectionCard>
    </>
  );
}
