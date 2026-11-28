'use client';

import { useEffect, useState } from 'react';
import { CrmReferral, ReferrerKind, addReferral, fetchReferrals, removeReferral } from '@/lib/b2b/referrals';
import { normalisePhone } from '@/lib/org/utils';
import { SectionCard } from './inbound-chips';

export interface StudioReferralRow {
  name: string;
  phone: string;
  status: string;
  orders?: number;
  value?: number;
}

const EMPTY = { name: '', phone: '', note: '', city: '', projectType: '', categories: '', book: false, ec: '', on: '', time: '', requirements: '' };

const split = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

const input = 'h-8 border border-gray-200 rounded-md px-2 text-[13px] bg-white text-gray-800 outline-none focus:border-gray-400';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function ReferralsCard({ kind, referrerId, referrerName, by, studio = [], note }: {
  kind: ReferrerKind;
  referrerId: string;
  referrerName?: string;
  by?: string;
  studio?: StudioReferralRow[];
  note?: React.ReactNode;
}) {
  const [list, setList] = useState<CrmReferral[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchReferrals()
      .then((all) => { if (alive) setList(all.filter((r) => r.referrerKind === kind && r.referrerId === referrerId)); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [kind, referrerId]);

  const phone = normalisePhone(form.phone);
  const toStudio = kind === 'client';
  const valid = form.name.trim() !== '' && /^[6-9]\d{9}$/.test(phone) && (!form.book || /^\d{4}-\d{2}-\d{2}$/.test(form.on));
  const crmPhones = new Set((list ?? []).map((r) => r.clientPhone));
  const studioOnly = studio.filter((s) => !crmPhones.has(normalisePhone(s.phone)));

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setMessage(null);
    try {
      const { referral, studioNote } = await addReferral({
        referrerKind: kind, referrerId, referrerName, clientName: form.name.trim(), clientPhone: phone, note: form.note.trim() || undefined, createdBy: by,
        ...(toStudio ? {
          city: form.city.trim() || undefined, projectType: form.projectType.trim() || undefined, categories: split(form.categories),
          visit: form.book ? { ec: form.ec.trim() || undefined, on: form.on, time: form.time.trim() || undefined, categories: split(form.categories), requirements: form.requirements.trim() || undefined } : undefined,
        } : {}),
      });
      setList((prev) => [referral, ...(prev ?? []).filter((r) => r.id !== referral.id)]);
      const booked = form.book;
      setForm(EMPTY);
      setAdding(false);
      setMessage(studioNote ? { tone: 'error', text: studioNote }
        : referral.onStudio ? { tone: 'ok', text: booked ? 'Saved, approved on Studio Space, and the store visit is booked there.' : 'Saved, and approved on Studio Space.' }
          : booked ? { tone: 'error', text: 'Saved in the CRM only: this firm is not on Studio Space, so no store visit was booked.' }
            : { tone: 'ok', text: 'Saved.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save the referral' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: CrmReferral) => {
    setBusy(true);
    setMessage(null);
    try {
      await removeReferral(r.id);
      setList((prev) => (prev ?? []).filter((x) => x.id !== r.id));
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Could not remove the referral' });
    } finally {
      setBusy(false);
    }
  };

  const count = (list?.length ?? 0) + studioOnly.length;
  return (
    <SectionCard
      title="Referred clients"
      subtitle={failed ? 'Could not load' : list === null ? 'Loading…' : `${count} referred`}
      info={kind === 'client' ? 'When this firm sends its own client to Material Depot, add them here. They reach Studio Space already approved, with any store visit you book, so nobody enters them twice. Their orders count as Referred.' : 'When this lead sends their own client to Material Depot, add them here. Their orders count as Referred, and they show under Carts & PIs → Referred clients.'}
      right={!adding && (
        <button onClick={() => setAdding(true)} className="text-[12px] font-medium text-[#0F766E] hover:underline">+ Add referral</button>
      )}
    >
      {note}
      {adding && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input aria-label="Client name" placeholder="Client name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} w-[160px]`} />
          <input aria-label="Client mobile" placeholder="10-digit mobile" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${input} w-[130px]`} />
          <input aria-label="Note" placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={`${input} flex-1 min-w-[140px]`} />
          {toStudio && (
            <div className="basis-full flex flex-wrap items-center gap-2">
              <input aria-label="City" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={`${input} w-[120px]`} />
              <input aria-label="Project type" placeholder="Project type" value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value })} className={`${input} w-[140px]`} />
              <input aria-label="Categories" placeholder="Categories, comma separated" value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} className={`${input} flex-1 min-w-[180px]`} />
              <label className="flex items-center gap-1.5 text-[12.5px] text-gray-700">
                <input type="checkbox" checked={form.book} onChange={(e) => setForm({ ...form, book: e.target.checked })} /> Book a store visit
              </label>
            </div>
          )}
          {toStudio && form.book && (
            <div className="basis-full flex flex-wrap items-center gap-2">
              <input aria-label="Experience centre" placeholder="Experience centre" value={form.ec} onChange={(e) => setForm({ ...form, ec: e.target.value })} className={`${input} w-[150px]`} />
              <input aria-label="Visit date" type="date" value={form.on} onChange={(e) => setForm({ ...form, on: e.target.value })} className={`${input} w-[140px]`} />
              <input aria-label="Visit time" placeholder="Time (any time)" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={`${input} w-[130px]`} />
              <input aria-label="Requirements" placeholder="What they need" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} className={`${input} flex-1 min-w-[160px]`} />
            </div>
          )}
          <button disabled={!valid || busy} onClick={save} className="h-8 px-3 rounded-md text-[13px] font-semibold bg-gray-900 text-white disabled:opacity-40">Save</button>
          <button onClick={() => setAdding(false)} className="h-8 px-2 text-[13px] text-gray-500">Cancel</button>
        </div>
      )}
      {message && <p className={`text-[12px] mb-2 ${message.tone === 'ok' ? 'text-teal-700' : 'text-amber-700'}`}>{message.text}</p>}
      {failed && <p className="text-[12px] text-amber-700">The referral list did not load. This does not mean there are none.</p>}
      {!failed && list !== null && count === 0 && !adding && (
        <p className="text-[12px] text-gray-400">No referrals yet.</p>
      )}
      {count > 0 && (
        <ul className="divide-y divide-gray-100">
          {(list ?? []).map((r) => (
            <li key={`crm:${r.id}`} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-gray-900">{r.clientName}</div>
                <div className="text-[12px] text-gray-500 tabular-nums">
                  {r.clientPhone} · {day(r.createdAt)}{r.createdBy ? ` · added by ${r.createdBy}` : ''}{r.onStudio ? ' · on Studio Space' : ''}
                </div>
                {r.note && <div className="text-[12px] text-gray-500 line-clamp-2">{r.note}</div>}
              </div>
              <button disabled={busy} onClick={() => remove(r)} className="text-[12px] text-gray-400 hover:text-gray-800 shrink-0">Remove</button>
            </li>
          ))}
          {studioOnly.map((s) => (
            <li key={`studio:${s.phone}`} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-gray-900">{s.name}</div>
                <div className="text-[12px] text-gray-500 tabular-nums">{s.phone} · added on Studio Space · {s.status}</div>
              </div>
              {s.orders != null && <div className="text-[12px] text-gray-500 tabular-nums shrink-0">{s.orders} order{s.orders === 1 ? '' : 's'}</div>}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
