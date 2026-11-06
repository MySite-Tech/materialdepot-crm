'use client';

import { useState } from 'react';
import EcPicker from './ec-picker';
import { Field, SectionCard, inputCls } from './inbound-chips';
import { newB2BId } from '../models/ids';
import { LeadDeal, fmtINR } from '../models/mock-data';
import { dealIsOpen } from '../models/client';
import { EcVisit, saveEcVisit } from '@/lib/b2b/ec-visits';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { normalisePhone } from '@/lib/org/utils';

export const uniquePhones = (list: (string | undefined)[]): string[] =>
  [...new Set(list.map((p) => normalisePhone(p)).filter((p) => p.length === 10))];

export interface RedirectEnquiry {
  enqId: string;
  status: string;
  value: number;
  phone?: string;
}

export const openEnquiries = (deals: LeadDeal[]): RedirectEnquiry[] =>
  deals.filter((d) => dealIsOpen(d.status) && d.id).map((d) => ({ enqId: d.id, status: d.status, value: d.cartValue }));

export const enquiryLabel = (e: RedirectEnquiry): string => `${e.enqId} · ${e.status} · ${fmtINR(e.value)}`;

const PURPOSES = ['See the material in person', 'Selection with the EC team', 'Place the order at the EC', 'Sample collection'];

export function EcRedirectForm({ firm, contactName, phones, sourceTeam, leadRef, clientId, enquiry, onSent, onCancel }: {
  firm: string;
  contactName?: string;
  phones: string[];
  sourceTeam: B2BTeam;
  leadRef: string;
  clientId?: string;
  enquiry?: RedirectEnquiry;
  onSent: (v: EcVisit) => void;
  onCancel: () => void;
}) {
  const [ec, setEc] = useState<{ ecName?: string; ecBmName?: string }>({});
  const [purpose, setPurpose] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numbers = uniquePhones(enquiry?.phone ? [enquiry.phone] : phones);

  const submit = async () => {
    const missing = [!ec.ecName && 'the EC',!purpose.trim() && 'a purpose', !numbers.length && 'a 10-digit mobile'].filter(Boolean);
    if (missing.length) { setError(`Needs ${missing.join(', ')}.`); return; }
    setBusy(true);
    setError(null);
    try {
      onSent(await saveEcVisit({
        id: newB2BId('ECR'),
        kind: 'redirect',
        status: 'Directed',
        firm: firm || 'Unnamed lead',
        clientId,
        contactName,
        phone: numbers[0],
        phones: numbers,
        branch: ec.ecName as string,
        bmName: ec.ecBmName,
        sourceTeam,
        leadRef,
        enqId: enquiry?.enqId,
        purpose: purpose.trim(),
        note: note.trim() || undefined,
        visitDate: date || undefined,
      }));
    } catch (e) {
      setError(`Not sent: ${e instanceof Error ? e.message : 'save failed'}`);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <EcPicker ecName={ec.ecName} ecBmName={ec.ecBmName} onChange={(p) => setEc((cur) => ({ ...cur, ...p }))} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Purpose" required>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} list="ec-redirect-purposes" placeholder="Why they are going" className={inputCls} />
          <datalist id="ec-redirect-purposes">{PURPOSES.map((p) => <option key={p} value={p} />)}</datalist>
        </Field>
        <Field label="Expected visit" hint="Optional. With a date, the store sees it in the Appointment Tracker.">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Note for the EC">
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What they want to see, budget, who is coming" className={inputCls + ' resize-none'} />
      </Field>
      <p className="text-[11px] text-gray-500">
        {enquiry ? `Sends ${enquiry.enqId} only. ` : ''}Number sent: {numbers.length ? numbers.join(', ') : 'none, add a mobile first'}
      </p>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
        <button onClick={submit} disabled={busy} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send to EC'}</button>
      </div>
    </div>
  );
}

export function sentLine(v: EcVisit): string {
  return `Sent to ${v.branch}${v.bmName ? ` (${v.bmName})` : ''}${v.enqId ? ` · ${v.enqId}` : ''} · ${v.purpose}. It is in the EC Directed tab.`;
}

export function RedirectToEc({ enquiries, enquiriesState, ...lead }: {
  firm: string;
  contactName?: string;
  phones: string[];
  sourceTeam: B2BTeam;
  leadRef: string;
  enquiries: RedirectEnquiry[];
  enquiriesState: 'loading' | 'failed' | 'ready';
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const [sent, setSent] = useState<EcVisit[]>([]);
  const enquiry = enquiries.find((e) => e.enqId === pick);
  const noCart = enquiriesState === 'ready' && !enquiries.length;

  return (
    <SectionCard
      title="Send a cart or PI to an EC"
      owner="crm"
      subtitle="Pick the cart or PI and the BM who takes it. If it is ordered at that EC, it counts as EC-directed revenue for B2B."
      right={!open && enquiriesState !== 'loading' && <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-[#0F766E] hover:underline whitespace-nowrap">+ Send to EC</button>}
    >
      {sent.map((v) => <p key={v.id} className="text-[11.5px] text-[#0F766E] mb-1">{sentLine(v)}</p>)}
      {open ? (
        <div className="flex flex-col gap-3">
          {noCart ? (
            <p className="text-[11px] text-gray-500">No open cart or PI on this lead yet, so the client is sent without one.</p>
          ) : enquiriesState === 'failed' ? (
            <p className="text-[11px] text-blue-700">The carts could not be read, so the client is sent without one.</p>
          ) : (
            <Field label="Cart or PI" required>
              <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls}>
                <option value="">Pick one</option>
                {enquiries.map((e) => <option key={e.enqId} value={e.enqId}>{enquiryLabel(e)}</option>)}
              </select>
            </Field>
          )}
          {(enquiry || noCart || enquiriesState === 'failed') && (
            <EcRedirectForm
              key={pick}
              {...lead}
              enquiry={enquiry}
              onSent={(v) => { setSent((s) => [v, ...s]); setOpen(false); setPick(''); }}
              onCancel={() => { setOpen(false); setPick(''); }}
            />
          )}
        </div>
      ) : !sent.length && <p className="text-[11.5px] text-gray-400">{enquiriesState === 'loading' ? 'Reading the carts…' : 'Nothing sent from here yet.'}</p>}
    </SectionCard>
  );
}
