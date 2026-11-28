'use client';

import { Dispatch, SetStateAction, useState } from 'react';
import { DealInline } from '../../../ui/deal-detail';
import { LeadDeal, OutreachLead, fmtINR } from '../../../models/mock-data';
import EcPicker from '../../../ui/ec-picker';
import { Empty, Field, SectionCard, Spinner, fmtDay } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';

export function OutreachDealsCard({ checkEnq, deals, dealsFailed, draft, set }: {
  checkEnq: (id?: string | undefined) => Promise<void>;
  deals: LeadDeal[] | null;
  dealsFailed: boolean;
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  return (
    <SectionCard title="Carts and PIs" owner="deals" info="Every deal ticket Procurement holds on this client's numbers. Click one to show its products and full detail under it; Use as Enq ID picks it.">
      {deals === null ? <Spinner label="Loading deal tickets…" />
        : dealsFailed ? (
          <p className="text-[12px] text-red-600 leading-snug">
            The deal system did not answer, so this list is unreadable, not empty. Do not read it
            as &ldquo;this client has no carts&rdquo;.
          </p>
        ) : !draft.phone ? (
          <Empty>No contact number on this lead, so no tickets can be matched.</Empty>
        ) : deals.length === 0 ? (
          <Empty>No deal tickets on this client&rsquo;s numbers.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {deals.map((d) => (
              <div key={d.id} className={`rounded-md border ${d.id === draft.enqId ? 'border-[#0F766E]' : 'border-gray-200'}`}>
              <button onClick={() => setViewing(viewing === d.id ? null : d.id)} aria-expanded={viewing === d.id} className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-mono font-semibold text-gray-800">{d.id}</span>
                  <span className="text-[12px] font-mono text-gray-700">{fmtINR(d.cartValue)}<span className="ml-1.5 text-gray-400">{viewing === d.id ? '▴' : '▾'}</span></span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {[d.status, d.branch, d.assignedTo, d.createdAt && fmtDay(d.createdAt)].filter(Boolean).join(' · ')}
                </div>
                {d.cartItems && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{d.cartItems}</div>}
              </button>
              {d.id !== draft.enqId && (
                <button onClick={() => { set('enqId', d.id); checkEnq(d.id); }} className="px-3 pb-2 text-[11.5px] font-medium text-[#0F766E] hover:underline">Use as Enq ID</button>
              )}
              {viewing === d.id && <div className="px-2 pb-2"><DealInline enqId={d.id} /></div>}
              </div>
            ))}
          </div>
        )}
    </SectionCard>
  );
}

export function OutreachAssistedCard({ draft, set, setDraft }: {
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
  setDraft: Dispatch<SetStateAction<OutreachLead>>;
}) {
  return (
    <SectionCard title="Who is on it" info="Assisted at EC: the Experience Centre and BM who helped close it.">
      <div className="flex flex-col gap-2.5">
        <Field label="Spok" className="sm:max-w-[50%]" info="Whoever is speaking to this lead. Shown on the Leads tab.">
          <input value={draft.spok || ''} onChange={(e) => set('spok', e.target.value)} placeholder={draft.bm} className={inputCls} />
        </Field>
        <EcPicker ecName={draft.ecName} ecBmName={draft.ecBmName} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      </div>
    </SectionCard>
  );
}
