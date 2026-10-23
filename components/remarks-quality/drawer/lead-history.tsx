'use client';

import { useEffect, useMemo, useState } from 'react';

import { LeadHistoryEvent, fetchLeadHistory } from '@/lib/api';

import { BNAME, BUCKET_TAG, STATUS_LABEL, TYPE_LABEL } from '../constants';
import type { Thresholds } from '../types';
import { dlabel, hhmm } from '../utils/dates';
import { fmt, inr } from '../utils/format';
import { PointerRegexes, bucket, isSystemText, pointersOfText } from '../utils/scoring';
import { EmptyState, ErrorBanner, PointerChips, Spinner } from '../ui';

const KIND: Record<LeadHistoryEvent['kind'], [string, string, string]> = {
  remark: ['Remark', '#F59E0B', 'bg-amber-100 text-amber-800'],
  ticket: ['Ticket opened', '#9CA3AF', 'bg-gray-100 text-gray-600'],
  owner: ['Owner change', '#9CA3AF', 'bg-gray-100 text-gray-600'],
  visit: ['Store visit', '#EA580C', 'bg-orange-50 text-orange-800'],
  quote: ['Quote', '#2563EB', 'bg-blue-50 text-blue-700'],
  order: ['Order placed', '#16A34A', 'bg-green-50 text-green-700'],
};

const fmtAt = (a: string) => {
  const [d, t] = a.split(' ');
  return `${dlabel(d)} ${d.slice(0, 4)} · ${hhmm(+t.slice(0, 2) * 60 + +t.slice(3, 5))}`;
};

export function LeadHistory({ cart, rx, thresholds }: { cart: string; rx: PointerRegexes; thresholds: Thresholds }) {
  const [events, setEvents] = useState<LeadHistoryEvent[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setEvents(null);
    setError('');
    fetchLeadHistory(cart)
      .then(d => { if (live) setEvents(d.events); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [cart]);

  const summary = useMemo(() => {
    if (!events) return null;
    const typed = events.filter(e => e.kind === 'remark' && !isSystemText(e.detail || ''));
    const count = (k: LeadHistoryEvent['kind']) => events.filter(e => e.kind === k).length;
    return {
      typed: typed.length, visits: count('visit'), quotes: count('quote'), orders: count('order'), tickets: count('ticket'),
      since: events.length ? events[events.length - 1].at_ist.slice(0, 10) : '',
      people: [...new Set(typed.map(e => e.who).filter(Boolean))].join(', '),
    };
  }, [events]);

  if (error) return <div className="mt-4"><ErrorBanner>Could not load history: {error}</ErrorBanner></div>;
  if (!events || !summary) {
    return (
      <div className="pt-3 space-y-3" aria-busy="true">
        <div className="flex items-center gap-2 text-[12px] text-gray-500"><Spinner />Loading history…</div>
        {[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />)}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-4 text-[12px] text-gray-500 pt-2.5 pb-1">
        {([[summary.typed, 'typed remarks'], [summary.visits, 'store visits'], [summary.quotes, 'quotes'], [summary.orders, 'orders'], [summary.tickets, 'tickets']] as const).map(([n, label]) => (
          <span key={label}><b className="text-[13px] text-gray-900 tabular-nums">{fmt(n)}</b> {label}</span>
        ))}
        {summary.since && <span>since <b className="text-[13px] text-gray-900">{dlabel(summary.since)}</b></span>}
        {summary.people && <span>by {summary.people}</span>}
      </div>
      {!events.length && <div className="pt-4"><EmptyState title="No history found for this cart" sub="Nothing has been logged on this cart ID yet." /></div>}
      <div className="relative ml-2.5 mt-2 border-l-2 border-gray-200 pl-[18px]">
        {events.map((e, i) => {
          const detail = e.detail || '';
          const sys = e.kind === 'remark' && isSystemText(detail);
          const len = detail.replace(/\s+/g, ' ').trim().length;
          const b = bucket(len, thresholds);
          const sub = e.kind === 'remark' || e.kind === 'ticket' ? TYPE_LABEL[e.sub || ''] || e.sub
            : e.kind === 'quote' || e.kind === 'order' ? STATUS_LABEL[e.sub || ''] || e.sub
              : e.kind === 'visit' ? e.sub : '';
          return (
            <div key={i} className="relative py-2">
              <span className="absolute -left-[25px] top-[13px] w-2.5 h-2.5 rounded-full border-2 border-white ring-1 ring-gray-200" style={{ background: KIND[e.kind][1] }} />
              <div className="flex flex-wrap gap-2 items-center text-[12px] text-gray-500">
                <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 ${KIND[e.kind][2]}`}>{KIND[e.kind][0]}</span>
                {e.kind === 'remark' && (sys
                  ? <span className="text-[10px] font-bold rounded px-1.5 bg-gray-100 text-gray-500">SYSTEM</span>
                  : <><span className={`text-[10px] font-bold rounded px-1.5 ${BUCKET_TAG[b]}`}>{BNAME[b].toUpperCase()} · {len}</span><PointerChips p={pointersOfText(detail, rx)} /></>)}
                <span className="font-semibold text-gray-900">{fmtAt(e.at_ist)}</span>
                {e.who && e.who !== 'None' && <span className="font-bold text-gray-900 text-[13px]">{e.who}</span>}
                {sub && <span className="bg-gray-100 rounded px-1.5 text-[11px]">{sub}</span>}
                {e.amt ? <span className="tabular-nums">{inr(e.amt)}</span> : null}
              </div>
              {e.kind !== 'owner' && (
                <div className={`mt-1 whitespace-pre-wrap break-words text-[13px] ${sys || e.kind !== 'remark' ? 'italic text-gray-500' : ''}`}>{detail}</div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
