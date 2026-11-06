'use client';

import { useMemo, useState } from 'react';
import { fmtShortINR } from '../../../models/mock-data';
import { EC_VISIT_STATUSES } from '@/lib/b2b/ec-visits/constants';
import { useEcReferrals } from '../hooks/use-ec-referrals';
import { RedirectTable, ReferralTable, Stats } from '../ui/tables';
import { hay, inRange, redirectTotals, referralStage, referralTotals } from '../utils';

type Direction = 'both' | 'in' | 'out';

const control = 'px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E]';
const label = 'block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1';
const REFERRAL_STATES = ['Waiting to be assigned', 'With Outreach', 'Converted', 'Closed as lost'];

const referralState = (stage: string) => (stage.startsWith('With ') ? 'With Outreach' : stage);

export function AdminView() {
  const all = useEcReferrals('admin');
  const [direction, setDirection] = useState<Direction>('both');
  const [ec, setEc] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');

  const referrals = useMemo(() => all.data?.referrals ?? [], [all.data]);
  const redirects = useMemo(() => all.data?.redirects ?? [], [all.data]);
  const ecOptions = useMemo(
    () => [...new Set([...referrals.map((r) => r.ec), ...redirects.map((v) => v.branch)].filter(Boolean))].sort(),
    [referrals, redirects],
  );
  const needle = q.trim().toLowerCase();

  const refRows = useMemo(() => referrals.filter((r) =>
    (ec === 'all' || r.ec === ec)
    && inRange(r.at, from, to)
    && (status === 'all' || referralState(referralStage(r)) === status)
    && (!needle || hay(r.company, r.contactPerson, r.phone, r.by, r.bm, r.city).includes(needle))),
  [referrals, ec, from, to, status, needle]);

  const outRows = useMemo(() => redirects.filter((v) =>
    (ec === 'all' || v.branch === ec)
    && inRange(v.createdAt, from, to)
    && (status === 'all' || v.status === status)
    && (!needle || hay(v.firm, v.contactName, v.phone, ...v.phones, v.scheduledBy, v.bmName, v.enqId, v.leadRef).includes(needle))),
  [redirects, ec, from, to, status, needle]);

  const tIn = useMemo(() => referralTotals(refRows, all.orders), [refRows, all.orders]);
  const tOut = useMemo(() => redirectTotals(outRows), [outRows]);
  const byEc = useMemo(() => ecOptions
    .map((name) => ({
      name,
      referred: refRows.filter((r) => r.ec === name).length,
      converted: refRows.filter((r) => r.ec === name && r.status === 'Closed').length,
      sent: outRows.filter((v) => v.branch === name).length,
      visited: outRows.filter((v) => v.branch === name && v.status === 'Visited').length,
    }))
    .filter((r) => r.referred + r.sent > 0),
  [ecOptions, refRows, outRows]);

  const statusOptions = direction === 'in' ? REFERRAL_STATES : direction === 'out' ? EC_VISIT_STATUSES.filter((s) => s !== 'Scheduled') : [];
  const filtersKey = [direction, ec, from, to, status, needle].join('|');
  const ordersKnown = all.orders !== 'loading' && all.orders !== 'failed';
  const showIn = direction !== 'out';
  const showOut = direction !== 'in';

  if (all.error) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
        Referrals did not load ({all.error}). <button onClick={all.reload} className="underline font-semibold">Retry</button>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex items-end gap-2.5 flex-wrap">
        <div>
          <label className={label}>Direction</label>
          <select value={direction} onChange={(e) => { setDirection(e.target.value as Direction); setStatus('all'); }} className={control}>
            <option value="both">Both ways</option>
            <option value="in">EC → B2B (referrals)</option>
            <option value="out">B2B → EC (redirects)</option>
          </select>
        </div>
        <div>
          <label className={label}>EC</label>
          <select value={ec} onChange={(e) => setEc(e.target.value)} className={control}>
            <option value="all">Every EC</option>
            {ecOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>From</label>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={control} />
        </div>
        <div>
          <label className={label}>To</label>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={control} />
        </div>
        {statusOptions.length > 0 && (
          <div>
            <label className={label}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={control}>
              <option value="all">Any</option>
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-[200px]">
          <label className={label}>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Firm, contact, phone, who sent it, Enq ID" className={`${control} w-full`} />
        </div>
        {(ec !== 'all' || from || to || status !== 'all' || q) && (
          <button onClick={() => { setEc('all'); setFrom(''); setTo(''); setStatus('all'); setQ(''); }} className="text-[11.5px] font-semibold text-gray-500 hover:text-gray-800 py-1.5">Clear</button>
        )}
      </div>

      {showIn && (
        <Stats items={[
          { label: 'EC → B2B referrals', value: all.data ? String(tIn.referred) : '…' },
          { label: 'With Outreach', value: all.data ? String(tIn.withOutreach) : '…' },
          { label: 'Converted', value: all.data ? String(tIn.converted) : '…' },
          {
            label: 'Ordered by referred clients',
            value: ordersKnown ? fmtShortINR(tIn.value) : all.orders === 'failed' ? 'Unknown' : '…',
            sub: ordersKnown ? `${tIn.ordering} ordering${tIn.unknown ? ` · ${tIn.unknown} unknown` : ''}` : undefined,
            warn: ordersKnown && tIn.unknown > 0,
          },
        ]} />
      )}
      {showOut && (
        <Stats items={[
          { label: 'B2B → EC redirects', value: all.data ? String(tOut.sent) : '…' },
          { label: 'Waiting to visit', value: all.data ? String(tOut.waiting) : '…' },
          { label: 'Visited', value: all.data ? String(tOut.visited) : '…' },
          { label: 'Ordered at the EC', value: all.data ? fmtShortINR(tOut.value) : '…', sub: all.data ? `${tOut.checked} of ${tOut.sent} checked` : undefined, warn: !!all.data && tOut.checked < tOut.sent },
        ]} />
      )}

      {byEc.length > 1 && (
        <section className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400"><tr>
              <th className="px-3 py-2 text-left font-bold">By EC</th>
              {showIn && <><th className="px-3 py-2 text-right font-bold">Referred to B2B</th><th className="px-3 py-2 text-right font-bold">Converted</th></>}
              {showOut && <><th className="px-3 py-2 text-right font-bold">Sent by B2B</th><th className="px-3 py-2 text-right font-bold">Visited</th></>}
            </tr></thead>
            <tbody>
              {byEc.map((r) => (
                <tr key={r.name} onClick={() => setEc(r.name)} className="border-t border-gray-50 cursor-pointer hover:bg-gray-50" title="Show only this EC">
                  <td className="px-3 py-1.5 font-semibold text-gray-800">{r.name}</td>
                  {showIn && <><td className="px-3 py-1.5 text-right tabular-nums">{r.referred}</td><td className="px-3 py-1.5 text-right tabular-nums">{r.converted}</td></>}
                  {showOut && <><td className="px-3 py-1.5 text-right tabular-nums">{r.sent}</td><td className="px-3 py-1.5 text-right tabular-nums">{r.visited}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {showIn && (
        <ReferralTable
          title="EC → B2B referrals"
          sub="Walk-in B2B clients store staff sent to the B2B team, newest first."
          rows={refRows}
          orders={all.orders}
          showBy
          empty={all.data ? 'No referral matches these filters.' : 'Loading…'}
          resetKey={filtersKey}
        />
      )}
      {showOut && (
        <RedirectTable
          title="B2B → EC redirects"
          sub="Clients and enquiries Inbound, Outreach and KAM sent to an Experience Centre, newest first."
          rows={outRows}
          empty={all.data ? 'No redirect matches these filters.' : 'Loading…'}
          resetKey={filtersKey}
        />
      )}
    </div>
  );
}
