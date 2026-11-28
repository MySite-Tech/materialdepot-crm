'use client';

import { Fragment, ReactNode, useState } from 'react';

import { callTally, inboundArrivalDay, inboundWorkDay, isOpenStatus, istDay, lastAttempt, requalifiedFrom } from '../../../models/inbound';
import { InboundLead, fmtINR } from '../../../models/mock-data';
import { CrmAddedTag, Empty, FollowUpChip, LeadName, PriorityChip, StatusBadge, fmtDay } from '../../../ui/inbound-chips';
import { LENS, LIST_PAGE_SIZE, OUTCOME_LENSES, lensGroupOf } from '../constants';
import { LeadCtx, Lens } from '../types';
import { gapsFor } from '../utils';
import { fmtFollowUp } from '../../../models/reminders';
import { DealInline } from '../../../ui/deal-detail';

const SINGLE_STATUS: Lens[] = ['new', 'closed', 'lost', 'invalid'];

const th = 'px-3 py-2 text-[9.5px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap';
const td = 'px-3 py-2.5 align-top';

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

const fmtDayYear = (day: string, today: string) => `${fmtDay(day)}${day.slice(0, 4) !== today.slice(0, 4) ? ` ${day.slice(0, 4)}` : ''}`;

function LeadDate({ lead, today }: { lead: InboundLead; today: string }) {
  const day = inboundArrivalDay(lead);
  if (!day) return <span className="text-gray-300">—</span>;
  const timed = !!lead.leadCreatedAt && istDay(lead.leadCreatedAt) === day;
  const earlier = requalifiedFrom(lead);
  const work = inboundWorkDay(lead.leadCreatedAt);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-gray-700">{fmtDay(day)}{timed ? <span className="text-gray-400">, {fmtTime(lead.leadCreatedAt!)}</span> : null}</span>
      {earlier
        ? <span className="text-[10.5px] text-gray-400">Re-enquired · first in Kylas {fmtDayYear(earlier, today)}</span>
        : timed && work > day ? <span className="text-[10.5px] text-gray-400">After 7 pm · counts {fmtDay(work)}</span> : null}
    </div>
  );
}

function FollowUp({ lead, today }: { lead: InboundLead; today: string }) {
  if (!isOpenStatus(lead.stage) || (lead.stage === 'New' && !(lead.callAttempts || []).length)) return <span className="text-gray-300">—</span>;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <FollowUpChip date={lead.followUpDate} today={today} />
      {lead.followUpDate && <span className="text-[10.5px] text-gray-400">{fmtFollowUp(lead.followUpDate, lead.followUpTime)}</span>}
    </div>
  );
}

function DealCell({ lead, ctx, onView }: { lead: InboundLead; ctx?: LeadCtx; onView: (enqId: string) => void }) {
  const d = ctx?.stage === 'pi' ? ctx.pis[0] : ctx?.stage === 'cart' ? ctx.carts[0] : undefined;
  const more = ctx ? ctx.carts.length + ctx.pis.length - 1 : 0;
  if (!d) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11.5px] font-semibold text-purple-700">PI marked in the CRM</span>
        <span className="text-[11px] text-gray-500">{lead.enqId ? <span className="font-mono">{lead.enqId}</span> : 'No PI ticket found on its numbers'}{lead.orderValue ? ` · ${fmtINR(lead.orderValue)}` : ''}</span>
      </div>
    );
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onView(d.enqId); }}
      title="Show the products and full detail under this lead"
      className="flex flex-col gap-0.5 min-w-0 text-left rounded-md -mx-1.5 px-1.5 py-1 hover:bg-indigo-50/60"
    >
      <span className="flex items-baseline gap-1.5">
        <span className={`text-[10px] font-semibold rounded px-1 ${d.kind === 'pi' ? 'bg-purple-50 text-purple-700' : 'bg-indigo-50 text-indigo-700'}`}>{d.kind === 'pi' ? 'PI' : 'Cart'}</span>
        <span className="font-mono text-gray-800">{d.value ? fmtINR(d.value) : '₹0'}</span>
      </span>
      <span className="text-[11px] text-gray-500 truncate" title={d.status}>
        <span className="font-mono">{d.enqId}</span> · opened {fmtDay(d.createdOn)}{more > 0 ? ` · +${more} more` : ''}
      </span>
      {(d.branch || d.bm) && <span className="text-[11px] text-gray-400 truncate">{[d.branch, d.bm].filter(Boolean).join(' · ')}</span>}
      <span className="text-[11px] font-medium text-indigo-700">View products</span>
    </button>
  );
}

function OpenTicketChip({ ctx, onView }: { ctx?: LeadCtx; onView: (enqId: string) => void }) {
  const d = ctx?.pis[0] ?? ctx?.carts[0];
  if (!d) return null;
  const more = ctx!.carts.length + ctx!.pis.length - 1;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onView(d.enqId); }}
      title={`${d.enqId} · ${d.status} · opened ${fmtDay(d.createdOn)}${d.branch ? ` · ${d.branch}` : ''}. Click to show the products and full detail under this lead.`}
      className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-px text-[10.5px] font-medium ${d.kind === 'pi' ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
    >
      {d.kind === 'pi' ? 'PI' : 'Cart'} still open · {fmtINR(d.value)}{more > 0 ? ` · +${more}` : ''}
    </button>
  );
}

function LastCall({ lead, ctx }: { lead: InboundLead; ctx?: LeadCtx }) {
  const last = lastAttempt(lead.callAttempts);
  if (ctx && !ctx.updated) {
    return <span className="text-amber-700 font-semibold">{last ? `None since ${fmtDay(ctx.since)}` : 'Never called'}</span>;
  }
  if (!last) return <span className="text-gray-300">—</span>;
  return (
    <span className="text-gray-600">
      {fmtDay(istDay(last.at))} · <span className={last.outcome === 'RNR' ? 'text-red-500' : 'text-[#0F766E]'}>{last.outcome}</span>
    </span>
  );
}

function Outcome({ lead, lens }: { lead: InboundLead; lens: Lens }) {
  const r = lead.outreachReferral;
  if (lens === 'sent' && r?.at) {
    return (
      <div className="flex flex-col gap-0.5 text-[11.5px]">
        <span className="text-[#0F766E] font-semibold">Sent {fmtDay(istDay(r.at))} by {r.by}</span>
        <span className="text-gray-500">Meet {fmtDay(r.meetingDate)}{r.meetingTime ? ` · ${r.meetingTime}` : ''} · {r.decisionMaker}</span>
      </div>
    );
  }
  if (lead.stage === 'Invalid') {
    if (!lead.invalidReason || !lead.invalidNote) {
      return <span className="text-amber-600 font-semibold">{lead.invalidReason || 'No reason recorded'}{lead.invalidNote ? '' : ' · no note'}</span>;
    }
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-gray-700 font-semibold">{lead.invalidReason}</span>
        <span className="text-[11px] text-gray-500 line-clamp-2" title={lead.invalidNote}>{lead.invalidNote}</span>
      </div>
    );
  }
  return <Deal lead={lead} />;
}

function Day({ day, empty }: { day: string; empty: string }) {
  return day ? <span className="text-gray-700">{fmtDay(day)}</span> : <span className="text-gray-300">{empty}</span>;
}

function Calls({ lead }: { lead: InboundLead }) {
  const t = callTally(lead.callAttempts);
  const last = lastAttempt(lead.callAttempts);
  if (!t.total) return <span className="text-gray-300">None yet</span>;
  return (
    <span title={`${t.connected} connected · ${t.rnr} RNR`}>
      {t.total} · <span className={last?.outcome === 'RNR' ? 'text-red-500' : 'text-[#0F766E]'}>last {last?.outcome}</span>
    </span>
  );
}

function Deal({ lead }: { lead: InboundLead }) {
  if (lead.stage === 'Lost') {
    return lead.lostReason
      ? <span className="text-red-500">{lead.lostReason}</span>
      : <span className="text-amber-600 font-semibold">No reason recorded</span>;
  }
  const value = lead.orderValue
    ? <span className="font-mono text-gray-800">{fmtINR(lead.orderValue)}</span>
    : lead.expectedOrderValue ? <span className="font-mono text-gray-400" title="BM’s estimate, no deal ticket yet">~{fmtINR(lead.expectedOrderValue)}</span> : null;
  const enq = lead.enqId
    ? <span className="font-mono text-[11px] text-gray-500">{lead.enqId}</span>
    : lead.stage === 'PI Shared' ? <span className="text-[11px] font-semibold text-amber-600">No Enq ID</span> : null;
  if (!value && !enq) return <span className="text-gray-300">—</span>;
  return <div className="flex flex-col gap-0.5 whitespace-nowrap">{value}{enq}</div>;
}

export function LeadTable({ lens, rows, ctx, today, showOwner, searchQuery, searchWide, valueText, page, setPage, onOpen, onClearSearch, emptyAction, picked, onTogglePick, onTogglePage }: {
  lens: Lens;
  rows: InboundLead[];
  ctx: Map<string, LeadCtx>;
  today: string;
  showOwner: boolean;
  searchQuery: string;
  searchWide?: boolean;
  valueText?: string;
  page: number;
  setPage: (p: number) => void;
  onOpen: (id: string) => void;
  onClearSearch: () => void;
  emptyAction?: ReactNode;
  picked?: Set<string>;
  onTogglePick?: (id: string) => void;
  onTogglePage?: (ids: string[]) => void;
}) {
  const meta = LENS[lens];
  const [shownDeal, setShownDeal] = useState<{ lead: string; enqId: string } | null>(null);
  const pages = Math.max(1, Math.ceil(rows.length / LIST_PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * LIST_PAGE_SIZE, (cur + 1) * LIST_PAGE_SIZE);
  const visibleIds = visible.map((l) => l.id);
  const group = searchQuery ? 'side' : lensGroupOf(lens);
  const showStatus = !SINGLE_STATUS.includes(lens);
  const showGaps = lens === 'gaps';
  const isResult = group === 'results' && OUTCOME_LENSES.includes(lens);
  const isDeals = group === 'deals';
  const showFollowUp = !isResult && lens !== 'new';
  const showCalls = group === 'calls' || group === 'side';
  const outcomeHead = lens === 'lost' ? 'Lost reason' : lens === 'invalid' ? 'Why invalid' : lens === 'sent' ? 'Handed over' : isResult ? 'Outcome' : 'Deal';
  const showOutcome = isResult || group === 'side';
  const columns = 2 + [!!picked, showStatus, isDeals, isResult, isDeals, showFollowUp, showCalls, showOwner, showOutcome, showGaps].filter(Boolean).length + 1;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ background: meta.accent }} />
            <h2 className="text-[14px] font-bold text-gray-900">
              {searchQuery ? `${lens === 'all' ? 'Leads' : meta.title} matching “${searchQuery}”` : meta.title}
            </h2>
            <span className="text-[12px] font-semibold text-gray-400 tabular-nums">{rows.length}</span>
            {valueText && <span className="text-[12px] font-semibold text-gray-600">· {valueText}</span>}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            {searchQuery
              ? searchWide
                ? 'Every lead in the CRM, 10 Nov or older, plus every stage and owner in the Kylas B2B pipeline.'
                : 'Every lead in the CRM, older than 10 Nov included. Press Enter to also search Kylas.'
              : meta.rule}
          </p>
        </div>
        {searchQuery && (
          <button onClick={onClearSearch} className="shrink-0 px-2.5 py-1 text-[11.5px] font-semibold border border-gray-200 rounded-md text-gray-600 hover:border-gray-400">
            Clear search ×
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-3">
          <Empty>{searchQuery ? `No lead here matches “${searchQuery}”.` : meta.empty}</Empty>
          {emptyAction}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {picked && (
                  <th className={th}>
                    <input
                      type="checkbox"
                      aria-label="Select this page"
                      checked={visibleIds.length > 0 && visibleIds.every((id) => picked.has(id))}
                      onChange={() => onTogglePage?.(visibleIds)}
                    />
                  </th>
                )}
                <th className={th}>Pri</th>
                <th className={th}>Lead</th>
                {showStatus && <th className={th}>Status</th>}
                {isDeals && <th className={th}>Cart / PI</th>}
                <th className={th}>Lead date</th>
                {isResult && <th className={th}>Outcome on</th>}
                {isDeals && <th className={th}>Last call</th>}
                {showFollowUp && <th className={th}>Follow-up</th>}
                {showCalls && <th className={th}>Calls</th>}
                {showOwner && <th className={th}>Owner</th>}
                {showOutcome && <th className={th}>{outcomeHead}</th>}
                {showGaps && <th className={th}>Missing</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const onViewDeal = (enqId: string) => setShownDeal((s) => (s?.lead === l.id && s.enqId === enqId ? null : { lead: l.id, enqId }));
                const deal = shownDeal?.lead === l.id ? shownDeal.enqId : '';
                return (
                  <Fragment key={l.id}>
                  <tr onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    {picked && (
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${l.company}`} checked={picked.has(l.id)} onChange={() => onTogglePick?.(l.id)} />
                      </td>
                    )}
                    <td className={td}><PriorityChip p={l.priority} /></td>
                    <td className={`${td} max-w-[260px]`}>
                      <div className="font-semibold text-gray-900 truncate"><LeadName lead={l} /><CrmAddedTag lead={l} /></div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {l.phone
                          ? <a href={`tel:${l.phone}`} onClick={(e) => e.stopPropagation()} className="font-mono hover:text-[#0F766E] hover:underline">{l.phone}</a>
                          : <span className="text-gray-300">No phone</span>}
                        {l.clientType && <span className="text-gray-400"> · {l.clientType}</span>}
                      </div>
                      {!isDeals && <OpenTicketChip ctx={ctx.get(l.id)} onView={onViewDeal} />}
                    </td>
                    {showStatus && <td className={td}><StatusBadge s={l.stage} /></td>}
                    {isDeals && <td className={`${td} max-w-[240px]`}><DealCell lead={l} ctx={ctx.get(l.id)} onView={onViewDeal} /></td>}
                    <td className={`${td} whitespace-nowrap`}><LeadDate lead={l} today={today} /></td>
                    {isResult && (
                      <td className={`${td} whitespace-nowrap`}>
                        <Day day={istDay(lens === 'sent' || isOpenStatus(l.stage) ? l.outreachReferral?.at : l.statusChangedAt)} empty="—" />
                      </td>
                    )}
                    {isDeals && <td className={`${td} whitespace-nowrap`}><LastCall lead={l} ctx={ctx.get(l.id)} /></td>}
                    {showFollowUp && <td className={`${td} whitespace-nowrap`}><FollowUp lead={l} today={today} /></td>}
                    {showCalls && (
                      <td className={`${td} whitespace-nowrap text-gray-500`}>
                        <Calls lead={l} />
                      </td>
                    )}
                    {showOwner && <td className={`${td} whitespace-nowrap text-gray-500`}>{l.owner}</td>}
                    {showOutcome && <td className={`${td} max-w-[260px]`}><Outcome lead={l} lens={lens} /></td>}
                    {showGaps && (
                      <td className={`${td} max-w-[260px] text-[11px] text-amber-700`}>
                        {gapsFor(l).map((g) => g.label).join(', ')}
                      </td>
                    )}
                  </tr>
                  {deal && (
                    <tr className="border-b border-gray-100">
                      <td colSpan={columns} className="px-3 pb-3 pt-0"><DealInline enqId={deal} /></td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">
            Showing {cur * LIST_PAGE_SIZE + 1}–{Math.min(rows.length, (cur + 1) * LIST_PAGE_SIZE)} of {rows.length}
          </span>
          {rows.length > LIST_PAGE_SIZE && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(cur - 1)} disabled={cur === 0}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
              <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
