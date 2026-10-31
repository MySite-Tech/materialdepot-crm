'use client';

import { COMPANY_TYPES, CompanyType } from '../../models/outreach';
import { istDay } from '../../models/outreach/reminders';
import { Field, fmtDay, inputCls } from '../../ui/inbound-chips';
import { btnPrimary } from '../../constants/ui';
import { fetchMyReferrals, sendEcReferral } from '@/lib/b2b/ec-referral';
import type { MyReferral } from '@/lib/b2b/ec-referral/types';
import { apptBranchesFor, apptBranchesFromCrm } from '@/lib/appointments/appt-shared';
import { normalisePhone } from '@/lib/org/utils';
import type { AppUser } from '@/types/crm';
import { useEffect, useMemo, useState } from 'react';

const BLANK = { company: '', contactPerson: '', phone: '', companyType: '' as CompanyType | '', designation: '', city: '', requirement: '', ec: '' };

const referralStatus = (r: MyReferral) => (r.status === 'Lost' ? 'Closed as lost' : r.bm ? `With ${r.bm}` : 'Waiting to be assigned');

export default function EcB2bReferral({ currentUser, branches }: { currentUser: AppUser; branches?: string[] }) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [mine, setMine] = useState<MyReferral[] | null>(null);
  const [mineFailed, setMineFailed] = useState(false);

  const ecs = useMemo(() => apptBranchesFor(currentUser, apptBranchesFromCrm(branches)), [currentUser, branches]);
  const onlyEc = ecs.length === 1 ? ecs[0] : '';
  const ec = form.ec || onlyEc;

  useEffect(() => {
    let alive = true;
    fetchMyReferrals()
      .then((list) => { if (alive) setMine(list); })
      .catch((e) => { console.error('[b2b] my EC referrals failed', e); if (alive) setMineFailed(true); });
    return () => { alive = false; };
  }, []);

  const set = <K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalisePhone(form.phone);
    const missing = [
      !form.company.trim() && 'the firm name',
      !form.contactPerson.trim() && 'the contact person',
      phone.length !== 10 && 'a 10-digit mobile',
      !form.companyType && 'the client type',
      !ec && 'the EC',
    ].filter(Boolean);
    if (missing.length) { setError(`Needs ${missing.join(', ')}.`); setSent(null); return; }
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const saved = await sendEcReferral({ ...form, phone, ec, companyType: form.companyType as CompanyType });
      setMine((m) => (m ? [saved, ...m] : m));
      setSent(`${saved.company} went to the B2B team. A B2B manager will assign it to Outreach.`);
      setForm(BLANK);
    } catch (err) {
      setError(`Not sent: ${err instanceof Error ? err.message : 'save failed'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[760px] mx-auto">
      <h1 className="text-[19px] font-bold text-gray-900">EC B2B Referral</h1>
      <p className="text-[11.5px] text-gray-500 mt-0.5 mb-4">
        A B2B client walked into the store? Send them to the B2B team here, and Outreach will follow up.
      </p>

      <form onSubmit={submit} className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
        {sent && <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-[12px] text-teal-900">{sent}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Firm name" required>
            <input value={form.company} onChange={(e) => set('company', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Client type" required>
            <select value={form.companyType} onChange={(e) => set('companyType', e.target.value as CompanyType | '')} className={inputCls}>
              <option value="">Select</option>
              {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Contact person" required>
            <input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Mobile" required>
            <input value={form.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Their role">
            <input value={form.designation} onChange={(e) => set('designation', e.target.value)} className={inputCls} />
          </Field>
          <Field label="City">
            <input value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Your EC" required hint={!branches ? 'Loading Experience Centres…' : undefined}>
            <select value={ec} disabled={!!onlyEc} onChange={(e) => set('ec', e.target.value)} className={inputCls}>
              {!onlyEc && <option value="">Select</option>}
              {ecs.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Referred by">
            <input value={currentUser.name} disabled className={inputCls} />
          </Field>
        </div>
        <Field label="What do they need?">
          <textarea value={form.requirement} rows={3} onChange={(e) => set('requirement', e.target.value)} className={inputCls} />
        </Field>
        <div>
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Sending…' : 'Send to B2B team'}</button>
        </div>
      </form>

      <div className="mt-5 bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h2 className="px-4 py-2.5 border-b border-gray-100 text-[12px] font-bold text-gray-800">Your referrals</h2>
        {mineFailed ? (
          <p className="px-4 py-3 text-[12px] text-amber-800">Your earlier referrals could not be loaded. New referrals still send.</p>
        ) : !mine ? (
          <p className="px-4 py-3 text-[12px] text-gray-400">Loading…</p>
        ) : !mine.length ? (
          <p className="px-4 py-3 text-[12px] text-gray-400">Nothing referred yet.</p>
        ) : mine.map((r) => (
          <div key={r.id} className="px-4 py-2 border-b border-gray-50 last:border-0 flex items-center justify-between gap-3 text-[12.5px]">
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{r.company}</div>
              <div className="text-[11px] text-gray-400 truncate">{r.contactPerson} · {r.ec} · {fmtDay(istDay(r.at))}</div>
            </div>
            <span className="text-[11.5px] text-gray-500 whitespace-nowrap">{referralStatus(r)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
