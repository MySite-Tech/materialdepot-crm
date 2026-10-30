'use client';

import { useEcVisits } from '../hooks/use-ec-visits';
import { fmtDate } from '../utils';
import { ClientEntity, primaryContact } from '../../../models/client';
import { istToday } from '../../../models/inbound';
import { newB2BId } from '../../../models/ids';
import EcPicker from '../../../ui/ec-picker';
import { Empty, Field, SectionCard } from '../../../ui/inbound-chips';
import { btnGhost, btnPrimary, inputCls } from '../../../constants/ui';
import { EC_VISIT_STATUSES, EcVisit, EcVisitStatus } from '@/lib/b2b/ec-visits';
import { useState } from 'react';

const STATUS_COLOR: Record<EcVisitStatus, string> = {
  Scheduled: 'text-blue-700 bg-blue-50 border-blue-200',
  Directed: 'text-violet-700 bg-violet-50 border-violet-200',
  Visited: 'text-teal-700 bg-teal-50 border-teal-200',
  Cancelled: 'text-gray-500 bg-gray-50 border-gray-200',
  'No show': 'text-amber-700 bg-amber-50 border-amber-200',
};

export function EcVisitsCard({ client }: { client: ClientEntity }) {
  const { visits, loading, error, save } = useEcVisits(client.id);
  const [scheduling, setScheduling] = useState(false);
  const today = istToday();
  const upcoming = visits.filter((v) => v.status === 'Scheduled' && (v.visitDate || '') >= today).length;

  return (
    <SectionCard
      title="EC visits"
      subtitle={loading ? 'Loading…' : error ? 'Unknown' : `${upcoming} upcoming · the store sees these in the Appointment Tracker`}
      right={!scheduling && !error && (
        <button onClick={() => setScheduling(true)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap">+ Schedule EC visit</button>
      )}
    >
      {error && <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">Could not load EC visits: {error}</p>}
      {scheduling && <ScheduleForm client={client} today={today} onCancel={() => setScheduling(false)} onSave={async (v) => {
        const err = await save(v);
        if (!err) setScheduling(false);
        return err;
      }} />}
      {!loading && !error && !visits.length && !scheduling && <Empty>No EC visit scheduled for this firm yet.</Empty>}
      {!!visits.length && (
        <ul className="flex flex-col gap-2 mt-2">
          {[...visits].reverse().map((v) => <VisitRow key={v.id} visit={v} onSave={save} />)}
        </ul>
      )}
    </SectionCard>
  );
}

function ScheduleForm({ client, today, onCancel, onSave }: {
  client: ClientEntity;
  today: string;
  onCancel: () => void;
  onSave: (v: EcVisit) => Promise<string | null>;
}) {
  const contact = primaryContact(client.contacts);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [ec, setEc] = useState<{ ecName?: string; ecBmName?: string }>({});
  const [who, setWho] = useState(contact?.name || '');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const missing = [!date && 'a date', !ec.ecName && 'the EC'].filter(Boolean);

  const submit = async () => {
    if (missing.length) { setError(`Pick ${missing.join(' and ')}.`); return; }
    setBusy(true);
    setError('');
    const err = await onSave({
      id: newB2BId('ECV'),
      kind: 'visit',
      phones: [],
      clientId: client.id,
      firm: client.company || 'Unnamed firm',
      contactName: who.trim() || undefined,
      phone: contact?.number || undefined,
      branch: ec.ecName as string,
      visitDate: date,
      visitTime: time || undefined,
      purpose: purpose.trim() || undefined,
      status: 'Scheduled',
      bmName: ec.ecBmName || undefined,
    });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/70 p-3 mb-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Visit date" required>
          <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Time">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="mt-3">
        <EcPicker ecName={ec.ecName} ecBmName={ec.ecBmName} onChange={setEc} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <Field label="Who is coming">
          <input value={who} onChange={(e) => setWho(e.target.value)} className={inputCls} />
        </Field>
        <Field label="What they want to see">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. laminates for the next site" className={inputCls} />
        </Field>
      </div>
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className={btnGhost}>Cancel</button>
        <button onClick={submit} disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Schedule visit'}</button>
      </div>
    </div>
  );
}

function VisitRow({ visit, onSave }: { visit: EcVisit; onSave: (v: EcVisit) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<EcVisitStatus>(visit.status);
  const [outcome, setOutcome] = useState(visit.outcome || '');
  const [enqId, setEnqId] = useState(visit.enqId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    const err = await onSave({ ...visit, status, outcome: outcome.trim() || undefined, enqId: enqId.trim() || undefined });
    setBusy(false);
    if (err) setError(err); else setEditing(false);
  };

  return (
    <li className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-gray-800">
            {fmtDate(visit.visitDate)}{visit.visitTime ? ` · ${visit.visitTime}` : ''} · {visit.branch}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {[visit.contactName, visit.bmName && `BM ${visit.bmName}`, visit.scheduledBy && `booked by ${visit.scheduledBy}`].filter(Boolean).join(' · ')}
          </div>
          {visit.purpose && <div className="text-[11px] text-gray-600 mt-0.5">{visit.purpose}</div>}
          {visit.outcome && <div className="text-[11px] text-gray-600 mt-0.5">Outcome: {visit.outcome}</div>}
          {visit.enqId && <div className="text-[11px] text-gray-600 mt-0.5 font-mono">{visit.enqId}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${STATUS_COLOR[visit.status]}`}>{visit.status}</span>
          {!editing && <button onClick={() => setEditing(true)} className="text-[11px] text-gray-400 hover:text-gray-700 underline cursor-pointer">update</button>}
        </div>
      </div>
      {editing && (
        <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as EcVisitStatus)} className={inputCls}>
              {EC_VISIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Outcome">
            <input value={outcome} onChange={(e) => setOutcome(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Enquiry ID" hint="If an order was raised at the EC">
            <input value={enqId} onChange={(e) => setEnqId(e.target.value)} className={inputCls} />
          </Field>
          {error && <p className="text-[11px] text-red-600 sm:col-span-3">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button onClick={() => setEditing(false)} className={btnGhost}>Cancel</button>
            <button onClick={submit} disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </li>
  );
}
