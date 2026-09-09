'use client';

import { ClientContact, ClientGst, isValidContactNumber, validateGst } from '../../../models/client';
import { fmtINR } from '../../../models/mock-data';
import { inputCls } from '../../../constants/ui';
import { ClientOrderRow } from '@/lib/b2b';

export function ContactRows({ contacts, onChange }: { contacts: ClientContact[]; onChange: (c: ClientContact[]) => void }) {
  const set = (i: number, patch: Partial<ClientContact>) =>
    onChange(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const makePrimary = (i: number) =>
    onChange(contacts.map((c, j) => ({ ...c, primary: j === i })));

  return (
    <div className="flex flex-col gap-2">
      {contacts.map((c, i) => {
        const bad = String(c.number || '').trim() && !isValidContactNumber(c.number);
        return (
          <div key={i} className="grid grid-cols-12 gap-1.5 items-start">
            <input
              value={c.number}
              onChange={(e) => set(i, { number: e.target.value })}
              placeholder="10-digit number"
              className={`col-span-4 ${inputCls} ${bad ? 'border-red-300' : ''}`}
            />
            <input value={c.name || ''} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name" className={`col-span-3 ${inputCls}`} />
            <input value={c.label || ''} onChange={(e) => set(i, { label: e.target.value })} placeholder="Label (Owner…)" className={`col-span-3 ${inputCls}`} />
            <button
              onClick={() => makePrimary(i)}
              title="Primary — the number orders are mainly placed on"
              className={`col-span-1 h-[30px] text-[10px] font-bold rounded-md border ${c.primary ? 'bg-[#0F766E] text-white border-[#0F766E]' : 'bg-white text-gray-400 border-gray-200'} cursor-pointer`}
            >
              1°
            </button>
            <button
              onClick={() => onChange(contacts.filter((_, j) => j !== i))}
              disabled={contacts.length === 1}
              className="col-span-1 h-[30px] text-[13px] text-gray-300 hover:text-red-500 disabled:opacity-30 cursor-pointer"
            >
              ×
            </button>
            {bad && <p className="col-span-12 text-[10px] text-red-600 -mt-1">Not a valid 10-digit Indian mobile number.</p>}
          </div>
        );
      })}
      <button
        onClick={() => onChange([...contacts, { number: '', primary: contacts.length === 0 }])}
        className="self-start text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer"
      >
        + Add contact number
      </button>
    </div>
  );
}

export function GstRows({ gsts, onChange }: { gsts: ClientGst[]; onChange: (g: ClientGst[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {gsts.map((g, i) => {
        const v = validateGst(g.number);
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex gap-1.5 items-start">
              <input
                value={g.number}
                onChange={(e) => onChange(gsts.map((x, j) => (j === i ? { ...x, number: e.target.value.toUpperCase() } : x)))}
                placeholder="15-character GSTIN"
                className={`${inputCls} font-mono ${!v.storable ? 'border-red-300' : v.check === 'bad-checksum' ? 'border-amber-300' : ''}`}
              />
              <button onClick={() => onChange(gsts.filter((_, j) => j !== i))} className="px-2 text-[13px] text-gray-300 hover:text-red-500 cursor-pointer">×</button>
            </div>
            {v.check === 'valid' && (
              <span className="text-[10px] text-[#0F766E]">
                Valid · {v.stateName} · PAN {v.pan}
                <span className="text-gray-400"> — registered company name needs a GST Validator, which this CRM does not have</span>
              </span>
            )}
            {v.check === 'bad-checksum' && <span className="text-[10px] text-amber-700">{v.message} Saved anyway.</span>}
            {!v.storable && v.check !== 'empty' && <span className="text-[10px] text-red-600">{v.message}</span>}
            {g.registeredName && <span className="text-[10px] text-gray-500">Registered as {g.registeredName}</span>}
          </div>
        );
      })}
      <button onClick={() => onChange([...gsts, { number: '' }])} className="self-start text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">
        + Add GST number
      </button>
    </div>
  );
}

export function OrderDetailsTable({ rows, failedPhones, rejected, loading, onRecheck }: {
  rows: ClientOrderRow[];
  failedPhones: string[];
  rejected: number;
  loading: boolean;
  onRecheck: () => void;
}) {
  if (loading) return <p className="text-[11px] text-gray-400 py-3">Reading the deal tickets…</p>;

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Order details · {rows.length} enquir{rows.length === 1 ? 'y' : 'ies'}
        </span>
        <button onClick={onRecheck} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">Re-check Procurement</button>
      </div>

      {!!failedPhones.length && (
        <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mb-2">
          {failedPhones.length} contact number{failedPhones.length === 1 ? '' : 's'}{' '}
          could not be read{' '}
          ({failedPhones.join(', ')}). This client&apos;s orders are <span className="font-semibold">incomplete</span>, not absent.
        </p>
      )}

      {!rows.length ? (
        <p className="text-[11px] text-gray-300 py-3 text-center">
          {failedPhones.length ? 'Nothing readable on the numbers that did load.' : 'No enquiry has ever been raised on this client’s numbers.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[860px]">
            <thead>
              <tr className="text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-100">
                <th className="text-left font-semibold py-1.5 pr-2">Enquiry ID</th>
                <th className="text-left font-semibold py-1.5 pr-2">Contact</th>
                <th className="text-left font-semibold py-1.5 pr-2">Company on order</th>
                <th className="text-left font-semibold py-1.5 pr-2">GST on order</th>
                <th className="text-right font-semibold py-1.5 pr-2">Order value</th>
                <th className="text-left font-semibold py-1.5 pr-2">Status</th>
                <th className="text-left font-semibold py-1.5 pr-2">Order placed</th>
                <th className="text-left font-semibold py-1.5">SPOC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.enqId + r.contactNumber} className="border-b border-gray-50 last:border-0">
                  <td className="py-1.5 pr-2 font-mono text-gray-700">{r.enqId}</td>
                  <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">
                    <span className="font-mono">{r.contactNumber}</span>
                    {r.contactName && <span className="text-gray-400"> · {r.contactName}</span>}
                  </td>

                  <td className="py-1.5 pr-2 text-gray-300 italic" title="Not in the deal-ticket response — see ClientOrderRow in b2bLeads.ts">not in Procurement</td>
                  <td className="py-1.5 pr-2 text-gray-300 italic" title="Not in the deal-ticket response">not in Procurement</td>
                  <td className="py-1.5 pr-2 text-right font-mono font-semibold text-gray-700 whitespace-nowrap">{fmtINR(r.orderValue)}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{
                        background: (r.ordered ? '#22C55E' : r.lost ? '#EF4444' : '#F59E0B') + '18',
                        color: r.ordered ? '#15803D' : r.lost ? '#B91C1C' : '#B45309',
                      }}
                    >
                      {r.status || '—'}
                    </span>
                    {r.lostReason && <span className="text-gray-400"> · {r.lostReason}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">
                    {r.orderPlacedDate
                      ? r.orderPlacedDate
                      : r.ordered
                        ? <span className="text-gray-400" title="Ordered, but the ticket carries no closure date">no closure date</span>
                        : <span className="text-gray-400">cart {r.createdAt || '—'}</span>}
                  </td>
                  <td className="py-1.5 text-gray-600 whitespace-nowrap">{r.spoc || <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-1.5">
        Every row comes from a Django deal ticket matched to this client by an EXACT contact-number match.
        {!!rejected && ` ${rejected} ticket${rejected === 1 ? ' the search returned under a different number was' : 's the search returned under different numbers were'} discarded.`}
        {' '}“KAM” on an order is the account&apos;s KAM <span className="italic">today</span> — nothing records who held it at the time.
      </p>
    </>
  );
}
