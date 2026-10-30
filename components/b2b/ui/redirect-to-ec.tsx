'use client';

import { useState } from 'react';
import EcPicker from './ec-picker';
import { Field, SectionCard, inputCls } from './inbound-chips';
import { newB2BId } from '../models/ids';
import { EcVisit, saveEcVisit } from '@/lib/b2b/ec-visits';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { normalisePhone } from '@/lib/org/utils';

export const uniquePhones = (list: (string | undefined)[]): string[] =>
  [...new Set(list.map((p) => normalisePhone(p)).filter((p) => p.length === 10))];

const PURPOSES = ['See the material in person', 'Selection with the EC team', 'Place the order at the EC', 'Sample collection'];

export function RedirectToEc({ firm, contactName, phones, sourceTeam, leadRef, clientId }: {
  firm: string;
  contactName?: string;
  phones: string[];
  sourceTeam: B2BTeam;
  leadRef: string;
  clientId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ec, setEc] = useState<{ ecName?: string; ecBmName?: string }>({});
  const [purpose, setPurpose] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<EcVisit[]>([]);
  const numbers = phones.filter((p) => p.length === 10);

  const submit = async () => {
    const missing = [!ec.ecName && 'the EC', !purpose.trim() && 'a purpose', !numbers.length && 'a 10-digit mobile on the lead'].filter(Boolean);
    if (missing.length) { setError(`Needs ${missing.join(', ')}.`); return; }
    setBusy(true);
    setError(null);
    try {
      const saved = await saveEcVisit({
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
        purpose: purpose.trim(),
        note: note.trim() || undefined,
        visitDate: date || undefined,
      });
      setSent((s) => [saved, ...s]);
      setOpen(false);
      setEc({}); setPurpose(''); setDate(''); setNote('');
    } catch (e) {
      setError(`Not sent: ${e instanceof Error ? e.message : 'save failed'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Redirect to an EC"
      owner="crm"
      subtitle="Send this client to an Experience Centre. Orders they place there count as EC-directed revenue for B2B."
      right={!open && <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-[#0F766E] hover:underline whitespace-nowrap">+ Redirect</button>}
    >
      {sent.map((v) => (
        <p key={v.id} className="text-[11.5px] text-[#0F766E] mb-1">Sent to {v.branch}{v.bmName ? ` (${v.bmName})` : ''} · {v.purpose}. It is in the EC Directed tab.</p>
      ))}
      {open ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EcPicker ecName={ec.ecName} ecBmName={ec.ecBmName} onChange={(p) => setEc((cur) => ({ ...cur, ...p }))} />
          </div>
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
          <p className="text-[11px] text-gray-500">Numbers sent: {numbers.length ? numbers.join(', ') : 'none — add a mobile first'}</p>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setOpen(false); setError(null); }} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
            <button onClick={submit} disabled={busy} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">{busy ? 'Sending…' : 'Redirect'}</button>
          </div>
        </div>
      ) : !sent.length && <p className="text-[11.5px] text-gray-400">Not redirected from here yet.</p>}
    </SectionCard>
  );
}
