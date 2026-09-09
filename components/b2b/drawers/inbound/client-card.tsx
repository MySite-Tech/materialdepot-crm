'use client';

import { CLIENT_TYPES, INBOUND_LOCATIONS, LEAD_TYPES, PRIORITIES, SEGMENTS } from '../../constants/inbound';
import { InboundLead } from '../../models/mockData';
import { Field, SectionCard } from '../../ui/inboundChips';
import { inputCls } from '../../utils/kams';

export function InboundClientCard({ draft, presalesTypeUnmapped, set }: {
  draft: InboundLead;
  presalesTypeUnmapped: boolean;
  set: <K extends keyof InboundLead>(k: K, v: InboundLead[K]) => void;
}) {
  return (
    <SectionCard title="Client" owner="crm" subtitle="§3.2 — your team owns these">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Client company name"
          className="sm:col-span-2"
          hint="The real company. Kylas ships the phone number in the name field."
        >
          <input
            value={draft.companyName || ''}
            onChange={(e) => set('companyName', e.target.value)}
            placeholder="e.g. Sundaram Interiors"
            className={inputCls}
          />
        </Field>
        <Field label="GST number">
          <input
            value={draft.gstNumber || ''}
            onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
            placeholder="29ABCDE1234F1Z5"
            className={inputCls}
          />
        </Field>
        <Field label="Segment">
          <select value={draft.segment || ''} onChange={(e) => set('segment', (e.target.value || undefined) as InboundLead['segment'])} className={inputCls}>
            <option value="">Select…</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>Segment {s}</option>)}
          </select>
        </Field>
        <Field
          label="Client type"
          hint={presalesTypeUnmapped
            ? `Presales recorded "${draft.presalesClientType}", which maps to no single value here.`
            : undefined}
        >
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
        <Field label="Priority">
          <select value={draft.priority || ''} onChange={(e) => set('priority', (e.target.value || undefined) as InboundLead['priority'])} className={inputCls}>
            <option value="">Select…</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field
          label="Location"
          owner="derived"
          hint={draft.pincode ? `Defaulted from pincode ${draft.pincode}` : 'No pincode from Presales — set it yourself'}
        >
          <select value={draft.location || ''} onChange={(e) => set('location', (e.target.value || undefined) as InboundLead['location'])} className={inputCls}>
            <option value="">Select…</option>
            {INBOUND_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
      </div>
    </SectionCard>
  );
}
