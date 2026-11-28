'use client';

import { LEAD_TYPES, SELECTIONS } from '../../../constants/inbound';
import { SEGMENTS } from '../../../models/kam';
import { CompanyType, OutreachLead } from '../../../models/mock-data';
import { COMPANY_TYPES, OutreachContact, TEAM_SIZES, TeamSize } from '../../../models/outreach';
import { LeadType, Segment } from '../../../types/inbound';
import { Field, SectionCard } from '../../../ui/inbound-chips';
import { Hint } from '../../../ui/info-tip';
import { RoleOptions } from '../../../ui/outreach-chips';
import { RequirementHistory } from '../../../ui/requirement-history';
import { inputCls } from '../../../constants/ui';

type Set = <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;

const ROW = 'grid grid-cols-[1fr_1fr_1fr_20px] gap-2 items-center';
const COL = 'text-[11.5px] font-medium text-gray-500';
const ROLES_ID = 'outreach-contact-roles';

function ContactRows({ contacts, onChange }: { contacts: OutreachContact[]; onChange: (next: OutreachContact[]) => void }) {
  const patch = (i: number, p: Partial<OutreachContact>) => onChange(contacts.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <>
      {contacts.map((c, i) => (
        <div key={i} className={ROW}>
          <input value={c.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Name" aria-label={`Person ${i + 1}`} className={inputCls} />
          <input value={c.role} onChange={(e) => patch(i, { role: e.target.value })} list={ROLES_ID} placeholder="Role" aria-label={`Person ${i + 1} role`} className={inputCls} />
          <input value={c.phone || ''} onChange={(e) => patch(i, { phone: e.target.value || undefined })} placeholder="Mobile" aria-label={`Person ${i + 1} mobile`} className={inputCls} />
          <button type="button" onClick={() => onChange(contacts.filter((_, j) => j !== i))} aria-label="Remove person" className="text-gray-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      ))}
    </>
  );
}

export function ContactsEditor({ contacts, onChange }: { contacts: OutreachContact[]; onChange: (next: OutreachContact[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className={COL}>Other people at the firm</span>
          <Hint text="Partners, project leads, procurement: anyone else you deal with. Each needs a name and a role." />
        </span>
        <button type="button" onClick={() => onChange([...contacts, { name: '', role: '' }])} className="text-[12px] font-medium text-[#0F766E] hover:underline">
          + Add person
        </button>
      </div>
      <RoleOptions id={ROLES_ID} />
      <ContactRows contacts={contacts} onChange={onChange} />
    </div>
  );
}

function People({ draft, set }: { draft: OutreachLead; set: Set }) {
  const contacts = draft.contacts || [];
  const altNeeded = !!draft.altPhone?.trim();
  return (
    <div className="flex flex-col gap-1.5">
      <RoleOptions id={ROLES_ID} />
      <div className={ROW}>
        <span className="flex items-center gap-1.5">
          <span className={COL}>People at the firm</span>
          <Hint text={'First row: the owner or designer, their role and mobile. All three are needed once a meeting is held. The mobile matches deal tickets and the Studio Space waitlist.\nSecond row: the alternate number, which needs the name and role of the person on it.\nThen anyone else you deal with, each with a name and a role.'} />
        </span>
        <span className={COL}>Role</span>
        <span className={COL}>Mobile</span>
        <span />
      </div>
      <div className={ROW}>
        <input value={draft.contactPerson || ''} onChange={(e) => set('contactPerson', e.target.value)}
          placeholder="Owner or designer *" aria-label="Owner or designer" className={inputCls} />
        <input value={draft.designation || ''} onChange={(e) => set('designation', e.target.value)}
          list={ROLES_ID} placeholder="Their role *" aria-label="Their role" className={inputCls} />
        <input value={draft.phone || ''} onChange={(e) => set('phone', e.target.value)}
          placeholder="Mobile *" aria-label="Mobile" className={inputCls} />
        <span />
      </div>
      <div className={ROW}>
        <input value={draft.altName || ''} onChange={(e) => set('altName', e.target.value || undefined)}
          placeholder={altNeeded ? 'Name on alternate *' : 'Name on alternate'} aria-label="Name on alternate" className={inputCls} />
        <input value={draft.altRole || ''} onChange={(e) => set('altRole', e.target.value || undefined)}
          list={ROLES_ID} placeholder={altNeeded ? 'Their role *' : 'Their role'} aria-label="Alternate's role" className={inputCls} />
        <input value={draft.altPhone || ''} onChange={(e) => set('altPhone', e.target.value || undefined)}
          placeholder="Alternate number" aria-label="Alternate number" className={inputCls} />
        <span />
      </div>
      <ContactRows contacts={contacts} onChange={(next) => set('contacts', next)} />
      <button type="button" onClick={() => set('contacts', [...contacts, { name: '', role: '' }])} className="self-start text-[12px] font-medium text-[#0F766E] hover:underline">
        + Add another person
      </button>
    </div>
  );
}

function Choice<V extends string>({ label, value, options, onChange, required }: {
  label: string;
  value?: V;
  options: readonly V[];
  onChange: (v: V | undefined) => void;
  required?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <select value={value || ''} onChange={(e) => onChange((e.target.value || undefined) as V | undefined)} className={inputCls}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}

export function OutreachClientCard({ draft, set }: { draft: OutreachLead; set: Set }) {
  const selections = draft.selections || [];
  return (
    <>
      <SectionCard title="Client" info="Captured on the field visit. Everything here travels to the KAM with the handover.">
        <div className="flex flex-col gap-3">
          <Field label="Company name" required>
            <input value={draft.company} onChange={(e) => set('company', e.target.value)} className={inputCls} />
          </Field>
          <People draft={draft} set={set} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Choice<CompanyType> label="Client type" required value={draft.companyType} options={COMPANY_TYPES} onChange={(v) => set('companyType', v)} />
            {draft.companyType === 'Other' && (
              <Field label="Specify" required>
                <input value={draft.companyTypeOther || ''} onChange={(e) => set('companyTypeOther', e.target.value)} placeholder="e.g. Modular factory" className={inputCls} />
              </Field>
            )}
            <Choice<Segment> label="Segment" required value={draft.segment} options={SEGMENTS} onChange={(v) => set('segment', v)} />
            <Choice<TeamSize> label="Team size" required value={draft.teamSize} options={TEAM_SIZES} onChange={(v) => set('teamSize', v)} />
            <Choice<LeadType> label="Lead type" value={draft.leadType} options={LEAD_TYPES} onChange={(v) => set('leadType', v)} />
            <Field label="City">
              <input value={draft.city || ''} onChange={(e) => set('city', e.target.value || undefined)} className={inputCls} />
            </Field>
            <Field label="GST number" info="Where the firm has one.">
              <input value={draft.gstNumber || ''} onChange={(e) => set('gstNumber', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email">
              <input value={draft.email || ''} onChange={(e) => set('email', e.target.value || undefined)} className={inputCls} />
            </Field>
          </div>
          <Field label="Office address" required info="Where their office or studio is. The KAM's handover carries it.">
            <input value={draft.officeAddress || ''} onChange={(e) => set('officeAddress', e.target.value || undefined)} className={inputCls} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Requirement" info="What the client needs, kept in the CRM. Earlier versions of the summary are kept below it.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Selection">
            {SELECTIONS.map((s) => {
              const on = selections.includes(s);
              return (
                <button
                  key={s}
                  aria-pressed={on}
                  onClick={() => set('selections', on ? selections.filter((x) => x !== s) : [...selections, s])}
                  className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${on ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <Field label="Summary">
            <textarea value={draft.requirement || ''} onChange={(e) => set('requirement', e.target.value)} rows={3}
              placeholder="Quantities, sizes, sites, timeline" className={inputCls + ' resize-none'} />
            <RequirementHistory history={draft.requirementHistory} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field label="Expected order value (₹)" info="Your estimate at qualification. Reported as an estimate on the Quote tile, never as revenue.">
              <input type="number" min={0} value={draft.expectedOrderValue ?? ''}
                onChange={(e) => set('expectedOrderValue', Number(e.target.value) || undefined)} className={inputCls} />
            </Field>
            <Field label="Expected date of closure" info="Shown as a column on the Leads tab.">
              <input type="date" value={draft.expectedClosure || ''} onChange={(e) => set('expectedClosure', e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
