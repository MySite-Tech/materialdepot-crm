'use client';

import { LEAD_TYPES } from '../../../constants/inbound';
import { SEGMENTS } from '../../../models/kam';
import { B2B_REPS, CompanyType, OutreachLead } from '../../../models/mock-data';
import { COMPANY_TYPES } from '../../../models/outreach';
import { LeadType, Segment } from '../../../types/inbound';
import { Field, SectionCard } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';

export function OutreachClientCard({ draft, set }: {
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
}) {
  return (
    <SectionCard title="Client" owner="crm" subtitle="Captured on the field visit">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Company name" required className="col-span-2 sm:col-span-1">
          <input value={draft.company} onChange={(e) => set('company', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Contact person">
          <input value={draft.contactPerson || ''} onChange={(e) => set('contactPerson', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Designation">
          <input value={draft.designation || ''} onChange={(e) => set('designation', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Contact number" hint="Used to match the deal tickets">
          <input value={draft.phone || ''} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
        </Field>
        <Field label="GST" hint="Optional — the PRD does not require it">
          <input value={draft.gstNumber || ''} onChange={(e) => set('gstNumber', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Segment">
          <select value={draft.segment || ''} onChange={(e) => set('segment', (e.target.value || undefined) as Segment | undefined)} className={inputCls}>
            <option value="">—</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Lead type">
          <select value={draft.leadType || ''} onChange={(e) => set('leadType', (e.target.value || undefined) as LeadType | undefined)} className={inputCls}>
            <option value="">—</option>
            {LEAD_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Company type">
          <select value={draft.companyType || ''} onChange={(e) => set('companyType', (e.target.value || undefined) as CompanyType | undefined)} className={inputCls}>
            <option value="">—</option>
            {COMPANY_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        {draft.companyType === 'Other' && (
          <Field label="Specify" required>
            <input value={draft.companyTypeOther || ''} onChange={(e) => set('companyTypeOther', e.target.value)} placeholder="e.g. Modular factory" className={inputCls} />
          </Field>
        )}
        <Field label="BM (owner)">
          <select value={draft.bm} onChange={(e) => set('bm', e.target.value)} className={inputCls}>
            {B2B_REPS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      </div>
    </SectionCard>
  );
}
