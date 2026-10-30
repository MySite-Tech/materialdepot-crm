'use client';

import { LEAD_TYPES } from '../../../constants/inbound';
import { SEGMENTS } from '../../../models/kam';
import { CompanyType, OutreachLead } from '../../../models/mock-data';
import { COMPANY_TYPES, OUTREACH_SOURCES, OUTREACH_SOURCE_HINT, OutreachContact, OutreachSource, TEAM_SIZES, TeamSize } from '../../../models/outreach';
import { Rep } from '../../../models/outreach/intake';
import { LeadType, Segment } from '../../../types/inbound';
import { Field, SectionCard } from '../../../ui/inbound-chips';
import { RoleOptions } from '../../../ui/outreach-chips';
import { inputCls } from '../../../constants/ui';

export function ContactsEditor({ contacts, onChange }: { contacts: OutreachContact[]; onChange: (next: OutreachContact[]) => void }) {
  const patch = (i: number, p: Partial<OutreachContact>) => onChange(contacts.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Other people at the firm</span>
        <button type="button" onClick={() => onChange([...contacts, { name: '', role: '' }])} className="text-[11px] font-semibold text-[#0F766E] hover:underline">
          + Add person
        </button>
      </div>
      <RoleOptions id="outreach-contact-roles" />
      {!contacts.length ? (
        <p className="text-[11px] text-gray-400">Partners, project leads, procurement — anyone else you deal with.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <input value={c.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Name" className={inputCls} />
              <input value={c.role} onChange={(e) => patch(i, { role: e.target.value })} list="outreach-contact-roles" placeholder="Role" className={inputCls} />
              <input value={c.phone || ''} onChange={(e) => patch(i, { phone: e.target.value || undefined })} placeholder="Mobile" className={inputCls} />
              <button type="button" onClick={() => onChange(contacts.filter((_, j) => j !== i))} title="Remove" className="text-gray-400 hover:text-red-600 text-lg leading-none px-1">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <Field label="Their role" required>
          <input value={draft.designation || ''} onChange={(e) => set('designation', e.target.value)} list="outreach-owner-roles" className={inputCls} />
          <RoleOptions id="outreach-owner-roles" />
        </Field>
        <Field label="Mobile" required hint="Matches deal tickets and the Studio Space waitlist">
          <input value={draft.phone || ''} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Alternate number">
          <input value={draft.altPhone || ''} onChange={(e) => set('altPhone', e.target.value || undefined)} className={inputCls} />
        </Field>
        <Field label="Name on alternate" required={!!draft.altPhone?.trim()}>
          <input value={draft.altName || ''} onChange={(e) => set('altName', e.target.value || undefined)} className={inputCls} />
        </Field>
        <Field label="Their role" required={!!draft.altPhone?.trim()}>
          <input value={draft.altRole || ''} onChange={(e) => set('altRole', e.target.value || undefined)} list="outreach-owner-roles" className={inputCls} />
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
        <Field label="Team size" required>
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
      <div className="mt-4 pt-4 border-t border-gray-100">
        <ContactsEditor contacts={draft.contacts || []} onChange={(next) => set('contacts', next)} />
      </div>
    </SectionCard>
  );
}
