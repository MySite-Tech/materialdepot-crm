'use client';

import { useState } from 'react';
import EcPicker from './ec-picker';
import { Field, SectionCard, fmtDay, inputCls } from './inbound-chips';
import { newB2BId } from '../models/ids';
import { fmtINR } from '../models/mock-data';
import { RedirectTickets, useClientRedirects } from '../hooks/use-client-redirects';
import { EcVisit, saveEcVisit } from '@/lib/b2b/ec-visits';
import { B2B_TEAM_LABEL } from '@/lib/b2b/team/constants';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { normalisePhone } from '@/lib/org/utils';

export const uniquePhones = (list: (string | undefined)[]): string[] =>
  [...new Set(list.map((p) => normalisePhone(p)).filter((p) => p.length === 10))];

const PURPOSES = ['See the material in person', 'Selection with the EC team', 'Place the order at the EC', 'Sample collection'];

const STATUS_TONE: Record<string, string> = {
  Directed: 'bg-blue-50 text-blue-700',
  Visited: 'bg-emerald-50 text-emerald-700',
  'No show': 'bg-amber-50 text-amber-700',
  Cancelled: 'bg-gray-100 text-gray-500',
};

function Step({ done, label, detail }: { done: boolean | null; label: string; detail?: string }) {
  const tone = done === null ? 'border-gray-200 text-gray-400' : done ? 'border-[#0F766E] bg-[#F0FDFA] text-[#0F766E]' : 'border-gray-200 text-gray-500';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {done === null ? '?' : done ? '✓' : '○'} {label}{detail && <span className="font-normal">{' '}· {detail}</span>}
    </span>
  );
}

function RedirectRow({ v, result }: { v: EcVisit; result?: RedirectTickets }) {
  const tickets = result && 'tickets' in result ? result.tickets : null;
  const orders = tickets?.filter((t) => t.ordered) ?? [];
  const unknown = !!result && 'error' in result;
  const sum = (list: { value: number }[]) => fmtINR(list.reduce((a, t) => a + t.value, 0));
  return (
    <div className="border border-gray-100 rounded-md px-3 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] font-semibold text-gray-900">{v.branch}</span>
        {v.bmName && <span className="text-[11px] text-gray-500">{v.bmName}</span>}
        <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${STATUS_TONE[v.status] ?? 'bg-gray-100 text-gray-600'}`}>{v.status}</span>
      </div>
      <p className="text-[11px] text-gray-500">
        {fmtDay(v.createdAt)} by {v.scheduledBy || 'unknown'}{v.sourceTeam ? ` from ${B2B_TEAM_LABEL[v.sourceTeam]}` : ''}
        {v.purpose ? ` · ${v.purpose}` : ''}{v.visitDate ? ` · visit expected ${fmtDay(v.visitDate)}` : ''}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Step done label="Redirected" detail={fmtDay(v.createdAt)} />
        <Step done={tickets ? tickets.length > 0 : null} label="Cart created" detail={tickets?.length ? `${tickets.length} · ${sum(tickets)}` : undefined} />
        <Step done={tickets ? orders.length > 0 : null} label="Order placed" detail={orders.length ? `${orders.length} · ${sum(orders)}` : undefined} />
      </div>
      {!result && <p className="text-[10.5px] text-gray-400">Checking carts and orders at {v.branch}…</p>}
      {unknown && <p className="text-[10.5px] text-amber-700">Carts and orders unknown: {(result as { error: string }).error}.</p>}
      {!!tickets?.length && (
        <ul className="text-[10.5px] text-gray-500">
          {tickets.map((t) => (
            <li key={t.id}><span className="font-mono">{t.id}</span> · {t.status || 'No status'} · {fmtINR(t.value)} · {fmtDay(t.createdAt)}</li>
          ))}
        </ul>
      )}
      {v.note && <p className="text-[10.5px] text-gray-400 break-words">Note: {v.note}</p>}
    </div>
  );
}

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
  const numbers = phones.filter((p) => p.length === 10);
  const { redirects, loadError, tickets, add } = useClientRedirects(leadRef, numbers);

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
      add(saved);
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
      subtitle="Every redirect of this client from any team, matched on its numbers, with carts and orders at that EC since."
      right={!open && <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-[#0F766E] hover:underline whitespace-nowrap">+ Redirect</button>}
    >
      {loadError && <p className="text-[11.5px] text-amber-700 mb-2">Redirects did not load: {loadError}. Whether this client was sent to an EC is unknown.</p>}
      {!!redirects?.length && (
        <div className="flex flex-col gap-2 mb-2">
          {redirects.map((v) => <RedirectRow key={v.id} v={v} result={tickets[v.id]} />)}
          <p className="text-[10.5px] text-gray-400">A cart counts when it is on one of the redirect&apos;s numbers, owned by that EC&apos;s staff, and opened on or after the redirect day.</p>
        </div>
      )}
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
      ) : redirects === null ? !loadError && <p className="text-[11.5px] text-gray-400">Loading redirects…</p>
        : !redirects.length && <p className="text-[11.5px] text-gray-400">Not sent to an EC by any team yet.</p>}
    </SectionCard>
  );
}
