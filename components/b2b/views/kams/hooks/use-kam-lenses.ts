'use client';

import { ClientEntity, ClientOrderMetrics, StudioFirm, contactNumbers, statusMonths, studioFirmOf } from '../../../models/client';
import {
  AssignedClientRow, KAM_DEAL_LENSES, KAM_FIRM_LENSES, KAM_LENS, KAM_LENS_GROUPS, KAM_REFERRAL_LENSES, KamDealLens, KamFirmLens, KamLens,
  KamReferralLens, KamReferralRow, KamTicketRow, assignedClientRows, firmHandoverState, firmLensMatches, kamReferralRows, kamTicketRows,
  referralLensMatches, sortReferrals, sortTickets, ticketLensMatches,
} from '../../../models/kam';
import { HANDOVER_TAT_HOURS } from '../../../models/outreach/handover';
import { fmtINR } from '../../../models/mock-data';
import type { LensTileGroup } from '../../../ui/lens-tiles';
import type { ClientOrderHistory } from '@/lib/b2b';
import type { CrmReferral } from '@/lib/b2b/referrals';
import type { OpenDeal } from '@/lib/b2b/inbound-deals/types';
import { leadDeals } from '@/lib/b2b/inbound-deals/utils';
import { useMemo } from 'react';

type Load = 'pending' | 'failed' | null;

const ORDER_STATUS_TILES: KamLens[] = ['assigned', 'active', 'lapsing', 'inactive', 'never'];

export const isDealLens = (k: KamLens): k is KamDealLens => (KAM_DEAL_LENSES as KamLens[]).includes(k);
export const isReferralLens = (k: KamLens): k is KamReferralLens => (KAM_REFERRAL_LENSES as KamLens[]).includes(k);

export function useKamLenses({ scoped, metricsFor, historyFor, dealsByPhone, referrals, studioFirms, q, segment, source, today, nowMs, canRespond, callTarget, state }: {
  scoped: ClientEntity[];
  metricsFor: (c: ClientEntity) => ClientOrderMetrics;
  historyFor: (phone: string) => ClientOrderHistory | undefined;
  dealsByPhone: Map<string, OpenDeal[]> | null;
  referrals: CrmReferral[] | null;
  studioFirms: StudioFirm[];
  q: string;
  segment: string;
  source: string;
  today: string;
  nowMs: number;
  canRespond: ((c: ClientEntity) => boolean) | null;
  callTarget: number;
  state: { loading: boolean; readingOrders: boolean; clients: Load; deals: Load; referrals: Load };
}) {
  const rows = useMemo(
    () => assignedClientRows(scoped, metricsFor, today, (c) => {
      if (!dealsByPhone) return [];
      const d = leadDeals(contactNumbers(c.contacts), dealsByPhone);
      return [...d.pis, ...d.carts];
    }),
    [scoped, metricsFor, today, dealsByPhone],
  );

  const digits = q.replace(/\D/g, '');
  const filteredRows = useMemo(() => rows.filter((r) => {
    if (segment !== 'all' && r.segment !== segment) return false;
    if (source !== 'all' && r.source !== source) return false;
    if (!q) return true;
    return r.company.toLowerCase().includes(q)
      || r.contactPerson.toLowerCase().includes(q)
      || (digits.length >= 4 && contactNumbers(r.client.contacts).some((p) => p.includes(digits)))
      || (q.length >= 4 && r.tickets.some((d) => d.enqId.toLowerCase().includes(q)));
  }), [rows, q, digits, segment, source]);

  const firmsBy = useMemo(() => {
    const out = Object.fromEntries(KAM_FIRM_LENSES.map((k) => [k, [] as AssignedClientRow[]])) as Record<KamFirmLens, AssignedClientRow[]>;
    for (const r of filteredRows) for (const k of KAM_FIRM_LENSES) if (firmLensMatches(k, r, today)) out[k].push(r);
    if (canRespond) out.signoff = out.signoff.filter((r) => canRespond(r.client));
    return out;
  }, [filteredRows, today, canRespond]);

  const ticketsBy = useMemo(() => {
    const all = kamTicketRows(filteredRows, today);
    return Object.fromEntries(KAM_DEAL_LENSES.map((k) => [k, sortTickets(k, all.filter((t) => ticketLensMatches(k, t)))])) as Record<KamDealLens, KamTicketRow[]>;
  }, [filteredRows, today]);

  const referralRows = useMemo(() => {
    const segOk = rows.filter((r) => (segment === 'all' || r.segment === segment) && (source === 'all' || r.source === source));
    const all = kamReferralRows(segOk, referrals ?? [], (c) => studioFirmOf(c, studioFirms)?.referrals ?? [], historyFor, dealsByPhone);
    if (!q) return all;
    return all.filter((r) => r.name.toLowerCase().includes(q) || r.firm.company.toLowerCase().includes(q) || (digits.length >= 4 && r.phone.includes(digits)));
  }, [rows, segment, source, referrals, studioFirms, historyFor, dealsByPhone, q, digits]);

  const referralsBy = useMemo(
    () => Object.fromEntries(KAM_REFERRAL_LENSES.map((k) => [k, sortReferrals(k, referralRows.filter((r) => referralLensMatches(k, r)))])) as Record<KamReferralLens, KamReferralRow[]>,
    [referralRows],
  );

  const countOf = (k: KamLens) => (isDealLens(k) ? ticketsBy[k].length : isReferralLens(k) ? referralsBy[k].length : firmsBy[k].length);

  const unread = firmsBy.assigned.filter((r) => r.status === 'Unknown').length;
  const lateSignoffs = firmsBy.signoff.filter((r) => firmHandoverState(r.client, nowMs) === 'overdue').length;
  const valueOf = (list: KamTicketRow[]) => list.reduce((a, t) => a + (t.deal.value || 0), 0);

  const figure = (k: KamLens): { value: string; sub?: string; warn?: boolean } => {
    const n = countOf(k);
    const v = String(n);
    switch (k) {
      case 'cartOpen': case 'piOpen': {
        const val = valueOf(ticketsBy[k]);
        return n ? { value: v, sub: `${val ? `${fmtINR(val)} · ` : ''}no follow-up yet`, warn: true } : { value: v, sub: 'none waiting' };
      }
      case 'cartFollow': case 'piFollow': {
        const due = ticketsBy[k].filter((t) => t.due === 'overdue' || t.due === 'today').length;
        const none = ticketsBy[k].filter((t) => t.due === 'none').length;
        return { value: v, sub: due ? `${due} due now` : none ? `${none} with no next date` : n ? 'booked ahead' : 'none yet', warn: due > 0 || none > 0 };
      }
      case 'signoff':  return { value: v, sub: lateSignoffs ? `${lateSignoffs} past ${HANDOVER_TAT_HOURS}h` : 'to accept', warn: lateSignoffs > 0 };
      case 'called':   return { value: `${n}/${callTarget}`, sub: n >= callTarget ? 'target met' : `${callTarget - n} to go` };
      case 'overdue':  return { value: v, sub: 'date passed', warn: n > 0 };
      case 'due':      return { value: v, sub: 'calls for today' };
      case 'meetings': return { value: v, sub: n ? 'booked for today' : 'none today' };
      case 'nofollow': return { value: v, sub: 'none booked' };
      case 'refNone':  return n ? { value: v, sub: 'chase the firm or client', warn: true } : { value: v, sub: 'all have shopped' };
      case 'refCart':  return { value: v, sub: 'help them order' };
      case 'refOrdered': return { value: v, sub: 'placed an order' };
      case 'assigned': return { value: v, sub: unread ? `${unread} status unknown` : 'firms in scope', warn: !!unread };
      case 'active':   return { value: v, sub: unread ? `${unread} status unknown` : `ordered ${statusMonths('Active', today)}`, warn: !!unread };
      case 'lapsing':  return { value: v, sub: `last order ${statusMonths('Inactive 2–3 months', today)}` };
      case 'inactive': return { value: v, sub: `last order ${statusMonths('Inactive 7–12 months', today)?.split('–')[0]}–${statusMonths('Inactive 4–6 months', today)?.split('–').pop()}` };
      case 'never':    return { value: v, sub: 'none in 12 months' };
      default:         return { value: v };
    }
  };

  const loadOf = (k: KamLens): Load => {
    if (state.loading) return 'pending';
    if (state.clients) return state.clients;
    if (isDealLens(k)) return state.deals;
    if (isReferralLens(k)) return state.referrals ?? (state.readingOrders ? 'pending' : null);
    if (state.readingOrders && ORDER_STATUS_TILES.includes(k)) return 'pending';
    return null;
  };

  const groups = (row: 1 | 2): LensTileGroup<KamLens>[] => KAM_LENS_GROUPS.filter((g) => g.row === row).map((g) => {
    const headLoad = g.head ? loadOf(g.head) : null;
    return {
      title: g.title,
      head: g.head ? { key: g.head, label: headLoad ? g.title : `${g.title} · ${countOf(g.head)}`, rule: KAM_LENS[g.head].rule } : undefined,
      tiles: g.lenses.map((k) => {
        const load = loadOf(k);
        const fig = load === 'pending' ? { value: '…', sub: state.loading ? 'loading' : 'reading orders' }
          : load === 'failed' ? { value: 'Unknown', sub: 'did not load', warn: true }
            : figure(k);
        return { key: k, title: KAM_LENS[k].title, rule: `${KAM_LENS[k].title}: ${KAM_LENS[k].rule}`, accent: KAM_LENS[k].accent, ...fig, muted: !load && countOf(k) === 0 };
      }),
    };
  });

  return { rows, firmsBy, ticketsBy, referralsBy, countOf, loadOf, tileRows: [groups(1), groups(2)] as const, valueOf };
}
