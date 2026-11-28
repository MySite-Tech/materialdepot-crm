'use client';

import type { StudioReferralDetail, StudioVisit } from '@/lib/b2b/studio-referrals';
import { fmtINR } from '../models/mock-data';
import { useStudioReferral } from '../hooks/use-studio-referral';
import { Spinner, fmtDay } from './inbound-chips';

const VISIT_TONE: Record<string, string> = {
  requested: 'bg-amber-50 text-amber-800',
  bm_assigned: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

const VISIT_LABEL: Record<string, string> = { requested: 'Waiting', bm_assigned: 'BM assigned', completed: 'Visited', cancelled: 'Cancelled' };

const STORE_LABEL: Record<string, string> = { unchecked: 'Store not checked', checking: 'Store checking', ready: 'Store ready', partial: 'Store partly ready', unavailable: 'Store cannot supply' };

function Facts({ items }: { items: [string, string | undefined][] }) {
  const shown = items.filter(([, v]) => v);
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[12px]">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] text-gray-400">{label}</dt>
          <dd className="text-gray-800 truncate" title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Visit({ v }: { v: StudioVisit }) {
  const detail = [v.ec, v.time, v.bm && `BM ${v.bm}${v.bmPhone ? ` ${v.bmPhone}` : ''}`].filter(Boolean).join(' · ');
  return (
    <li className="border border-gray-100 rounded-md bg-white px-2.5 py-2 flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] font-medium text-gray-900">{v.on ? fmtDay(v.on) : 'No date'}</span>
        <span className={`text-[10.5px] font-semibold rounded px-1.5 py-0.5 ${VISIT_TONE[v.status] ?? 'bg-gray-100 text-gray-600'}`}>{VISIT_LABEL[v.status] ?? v.status}</span>
        {v.storeStatus && v.storeStatus !== 'unchecked' && <span className="text-[11px] text-gray-500">{STORE_LABEL[v.storeStatus] ?? v.storeStatus}</span>}
        {v.bookedOn && <span className="text-[11px] text-gray-400 ml-auto">booked {fmtDay(v.bookedOn)}</span>}
      </div>
      {detail && <div className="text-[12px] text-gray-600">{detail}</div>}
      {v.categories.length > 0 && <div className="text-[12px] text-gray-600">Looking at: {v.categories.join(', ')}</div>}
      {v.requirements && <div className="text-[12px] text-gray-600 whitespace-pre-wrap">{v.requirements}</div>}
      {v.storeNote && <div className="text-[11.5px] text-gray-500">Store note: {v.storeNote}</div>}
      {v.cancelReason && <div className="text-[11.5px] text-red-600">Cancelled: {v.cancelReason}</div>}
    </li>
  );
}

function Detail({ d }: { d: StudioReferralDetail }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold text-gray-900">{d.clientName}</span>
        <span className="text-[11px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-600">{d.status}</span>
        <span className="text-[11.5px] text-gray-400">referred by {d.firmName}{d.referredOn ? ` on ${fmtDay(d.referredOn)}` : ''}</span>
      </div>
      <Facts
        items={[
          ['Phone', d.phone], ['Email', d.email], ['City', [d.city, d.locality].filter(Boolean).join(', ') || undefined],
          ['Project', d.projectType], ['Budget', d.budget], ['Timeline', d.timeline],
          ['Categories', d.categories.join(', ') || undefined], ['Source', d.source],
        ]}
      />
      {d.notes && <p className="text-[12px] text-gray-600 whitespace-pre-wrap">{d.notes}</p>}
      {d.rejectionReason && <p className="text-[12px] text-red-600">Rejected: {d.rejectionReason}</p>}
      {d.visits.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-[12px] font-semibold text-gray-900">Store visits · {d.visits.length}</h4>
          <ul className="flex flex-col gap-1.5">{d.visits.map((v, i) => <Visit key={i} v={v} />)}</ul>
        </section>
      )}
      {d.orders.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-[12px] font-semibold text-gray-900">Orders on Studio Space · {d.orders.length}</h4>
          <ul className="text-[12px] text-gray-700 divide-y divide-gray-100">
            {d.orders.map((o) => (
              <li key={o.enqId} className="py-1 flex items-center justify-between gap-3">
                <span className="font-mono text-[11.5px]">{o.enqId}{o.on ? ` · ${fmtDay(o.on)}` : ''}</span>
                <span className="tabular-nums">{fmtINR(o.value)}{o.approval && o.approval !== 'approved' ? ` · ${o.approval}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function StudioReferralDetailPanel({ phone }: { phone: string }) {
  const state = useStudioReferral(phone);
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-md px-3 py-2.5 cursor-default" onClick={(e) => e.stopPropagation()}>
      {state.status === 'loading' ? <Spinner label="Reading Studio Space…" />
        : state.status === 'failed' ? <p className="text-[12px] text-amber-700">Studio Space could not be read ({state.error}). Nothing here means it is empty.</p>
          : !state.details.length ? <p className="text-[12px] text-gray-500">Studio Space has no referral on this number. It was saved in the CRM only.</p>
            : <div className="flex flex-col gap-4">{state.details.map((d, i) => <Detail key={i} d={d} />)}</div>}
    </div>
  );
}
