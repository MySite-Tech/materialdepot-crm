'use client';

import { LEAD_TYPES } from '../../../constants/inbound';
import { SEGMENTS } from '../../../models/kam';
import { CompanyType, OutreachLead } from '../../../models/mock-data';
import { COMPANY_TYPES, OUTREACH_SOURCES, OUTREACH_SOURCE_HINT, OutreachSource, TEAM_SIZES, TeamSize } from '../../../models/outreach';
import { Rep } from '../../../models/outreach/intake';
import { LeadType, Segment } from '../../../types/inbound';
import { Field, SectionCard } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';

export function OutreachClientCard({ draft, set, reps, canPickBm, onPickBm }: {
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  reps: Rep[];
  canPickBm: boolean;
  onPickBm: (rep: Rep) => void;
}) {
  const bmOptions = reps.some((r) => r.name === draft.bm) ? reps : [{ name: draft.bm }, ...reps];
  return (
    <SectionCard title="Client" owner="crm" subtitle="Captured on the field visit">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Company name" required className="col-span-2 sm:col-span-1">
          <input value={draft.company} onChange={(e) => set('company', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Owner / designer" required>
          <input value={draft.contactPerson || ''} onChange={(e) => set('contactPerson', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Designation">
          <input value={draft.designation || ''} onChange={(e) => set('designation', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Mobile" required hint="Matches deal tickets and the Studio Space waitlist">
          <input value={draft.phone || ''} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
        </Field>
        <Field label="GST" hint="Where the firm has one">
          <input value={draft.gstNumber || ''} onChange={(e) => set('gstNumber', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Email">
          <input value={draft.email || ''} onChange={(e) => set('email', e.target.value || undefined)} className={inputCls} />
        </Field>
        <Field label="City">
          <input value={draft.city || ''} onChange={(e) => set('city', e.target.value || undefined)} className={inputCls} />
        </Field>
        <Field label="Office address" required className="col-span-2 sm:col-span-3">
          <input value={draft.officeAddress || ''} onChange={(e) => set('officeAddress', e.target.value || undefined)} className={inputCls} />
        </Field>
        <Field label="Team size">
          <select value={draft.teamSize || ''} onChange={(e) => set('teamSize', (e.target.value || undefined) as TeamSize | undefined)} className={inputCls}>
            <option value="">—</option>
            {TEAM_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Source" hint={draft.source ? OUTREACH_SOURCE_HINT[draft.source] : undefined}>
          <select value={draft.source || ''} onChange={(e) => set('source', (e.target.value || undefined) as OutreachSource | undefined)}
            disabled={!!draft.intake} className={inputCls}>
            <option value="">—</option>
            {OUTREACH_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Segment" required>
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
        <Field label="Client type" required>
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
        <Field label="BM (owner)" hint={canPickBm ? undefined : 'A manager can reassign'}>
          <select value={draft.bm} disabled={!canPickBm}
            onChange={(e) => { const r = bmOptions.find((x) => x.name === e.target.value); if (r) onPickBm(r); }} className={inputCls}>
            {bmOptions.map((r) => <option key={r.phone || r.name} value={r.name}>{r.name}</option>)}
          </select>
        </Field>
      </div>
    </SectionCard>
  );
}
