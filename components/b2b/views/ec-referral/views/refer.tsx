'use client';

import { useMemo, useState } from 'react';
import { COMPANY_TYPES, CompanyType } from '../../../models/outreach';
import { fmtShortINR } from '../../../models/mock-data';
import { Field, inputCls } from '../../../ui/inbound-chips';
import { btnPrimary } from '../../../constants/ui';
import { sendEcReferral } from '@/lib/b2b/ec-referral';
import { apptBranchesFor, apptBranchesFromCrm } from '@/lib/appointments/appt-shared';
import { normalisePhone } from '@/lib/org/utils';
import type { AppUser } from '@/types/crm';
import { useEcReferrals } from '../hooks/use-ec-referrals';
import { ReferralTable, Stats } from '../ui/tables';
import { referralTotals } from '../utils';

const BLANK = { company: '', contactPerson: '', phone: '', companyType: '' as CompanyType | '', designation: '', city: '', requirement: '', ec: '' };

export function ReferView({ currentUser, branches }: { currentUser: AppUser; branches?: string[] }) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const mine = useEcReferrals('mine');

  const ecs = useMemo(() => apptBranchesFor(currentUser, apptBranchesFromCrm(branches)), [currentUser, branches]);
  const onlyEc = ecs.length === 1 ? ecs[0] : '';
  const ec = form.ec || onlyEc;
  const rows = mine.data?.referrals ?? [];
  const t = useMemo(() => referralTotals(rows, mine.orders), [rows, mine.orders]);
  const ordersKnown = mine.orders !== 'loading' && mine.orders !== 'failed';

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
      mine.add(saved);
      setSent(`${saved.company} went to the B2B team. A B2B manager will assign it to Outreach.`);
      setForm(BLANK);
    } catch (err) {
      setError(`Not sent: ${err instanceof Error ? err.message : 'save failed'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
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

      {mine.error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Your referrals could not be loaded ({mine.error}). New referrals still send.{' '}
          <button onClick={mine.reload} className="underline font-semibold">Retry</button>
        </p>
      ) : (
        <>
          <Stats items={[
            { label: 'People you referred', value: mine.data ? String(t.referred) : '…' },
            { label: 'With Outreach now', value: mine.data ? String(t.withOutreach) : '…', sub: 'assigned to a B2B rep' },
            { label: 'Converted', value: mine.data ? String(t.converted) : '…', sub: 'first order placed' },
            {
              label: 'Ordered through your referrals',
              value: ordersKnown ? fmtShortINR(t.value) : mine.orders === 'failed' ? 'Unknown' : '…',
              sub: ordersKnown ? `${t.ordering} ${t.ordering === 1 ? 'client' : 'clients'} ordering${t.unknown ? ` · ${t.unknown} unknown` : ''}` : undefined,
              warn: ordersKnown && t.unknown > 0,
            },
          ]} />
          <ReferralTable
            title="Your referrals"
            sub="Every client you sent to B2B, where each one is now, and every order placed on their number."
            rows={rows}
            orders={mine.orders}
            showBy={false}
            empty={mine.data ? 'Nothing referred yet.' : 'Loading…'}
            resetKey={String(rows.length)}
          />
        </>
      )}
    </div>
  );
}
