'use client';

import { CLIENT_TYPES, INBOUND_LOCATIONS, LEAD_TYPES, PRIORITIES, SEGMENTS } from '../../../constants/inbound';
import { InboundLead } from '../../../models/mock-data';
import { ContactPerson } from '../../../types/inbound';
import { Field, SectionCard } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 10);

export function InboundClientCard({ draft, presalesTypeUnmapped, set }: {
  draft: InboundLead;
  presalesTypeUnmapped: boolean;
  set: <K extends keyof InboundLead>(k: K, v: InboundLead[K]) => void;
}) {
  const extra = draft.additionalContacts || [];
  const setExtra = (next: ContactPerson[]) => set('additionalContacts', next);

  return (
    <SectionCard title="Client details" owner="crm" subtitle="Filled by Inbound · passed to Outreach and the KAM">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Company name" className="sm:col-span-2" hint="The real company. Kylas ships the phone number in the name field.">
          <input value={draft.companyName || ''} onChange={(e) => set('companyName', e.target.value)} placeholder="e.g. Sundaram Interiors" className={inputCls} />
        </Field>

        <Field label="Primary person — name">
          <input value={draft.primaryContactName || ''} onChange={(e) => set('primaryContactName', e.target.value)}
            placeholder={draft.contactName || 'Who you spoke to'} className={inputCls} />
        </Field>
        <Field label="Primary person — mobile">
          <input inputMode="numeric" value={draft.primaryContactPhone || ''} onChange={(e) => set('primaryContactPhone', digits(e.target.value))}
            placeholder={draft.phone || '10-digit mobile'} className={inputCls} />
        </Field>

        <div className="sm:col-span-2 flex flex-col gap-2">
          {extra.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <Field label={`Additional person ${i + 1} — name`}>
                <input value={c.name} onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={inputCls} />
              </Field>
              <Field label="Mobile">
                <input inputMode="numeric" value={c.phone} onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, phone: digits(e.target.value) } : x)))} className={inputCls} />
              </Field>
              <button onClick={() => setExtra(extra.filter((_, j) => j !== i))} title="Remove"
                className="mb-1 text-gray-400 hover:text-red-600 text-lg leading-none px-1">×</button>
            </div>
          ))}
          <button onClick={() => setExtra([...extra, { name: '', phone: '' }])}
            className="self-start text-[11px] font-semibold text-[#0F766E] hover:underline">
            + Add another person
          </button>
        </div>

        <Field label="GST number">
          <input value={draft.gstNumber || ''} onChange={(e) => set('gstNumber', e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" className={inputCls} />
        </Field>
        <Field label="Segment">
          <select value={draft.segment || ''} onChange={(e) => set('segment', (e.target.value || undefined) as InboundLead['segment'])} className={inputCls}>
            <option value="">Select…</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>Segment {s}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={draft.priority || ''} onChange={(e) => set('priority', (e.target.value || undefined) as InboundLead['priority'])} className={inputCls}>
            <option value="">Select…</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Client type" hint={presalesTypeUnmapped ? `Presales recorded "${draft.presalesClientType}", which maps to no single value here.` : undefined}>
          <select value={draft.clientType || ''} onChange={(e) => set('clientType', (e.target.value || undefined) as InboundLead['clientType'])} className={inputCls}>
            <option value="">Select…</option>
            {CLIENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Lead type">
          <select value={draft.leadType || ''} onChange={(e) => set('leadType', (e.target.value || undefined) as InboundLead['leadType'])} className={inputCls}>
            <option value="">Select…</option>
            {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="City" owner="derived" hint={draft.pincode ? `Defaulted from pincode ${draft.pincode}` : 'No pincode from Presales — set it yourself'}>
          <select value={draft.location || ''} onChange={(e) => set('location', (e.target.value || undefined) as InboundLead['location'])} className={inputCls}>
            <option value="">Select…</option>
            {INBOUND_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Office address" className="sm:col-span-2" hint="Optional. Where their office or studio is — the firm record keeps it.">
          <input value={draft.officeLocation || ''} onChange={(e) => set('officeLocation', e.target.value)} placeholder="e.g. 2nd floor, 14 Main Rd, Indiranagar" className={inputCls} />
        </Field>
      </div>
    </SectionCard>
  );
}
