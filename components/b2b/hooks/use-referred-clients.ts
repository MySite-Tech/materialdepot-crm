'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchB2BBulk } from '@/lib/b2b';
import type { ClientOrderHistory } from '@/lib/b2b';
import { fetchReferrals, type CrmReferral, type ReferrerKind } from '@/lib/b2b/referrals';
import type { OpenDeal } from '@/lib/b2b/inbound-deals/types';
import { leadDeals } from '@/lib/b2b/inbound-deals/utils';
import { normalizeContactNumber } from '../models/client';
import { referralStage } from '../models/kam/cadence';
import type { ReferredRow, ReferredState } from '../types/referred';

interface Read {
  histories: Record<string, ClientOrderHistory>;
  unread: ReadonlySet<string>;
}

export function useReferredClients(
  kind: ReferrerKind,
  labels: Map<string, string>,
  dealsByPhone: Map<string, OpenDeal[]> | null,
  enabled: boolean,
): ReferredState {
  const [refs, setRefs] = useState<CrmReferral[] | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [read, setRead] = useState<Read | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchReferrals()
      .then((all) => { if (alive) { setRefs(all); setError(undefined); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [enabled]);

  const mine = useMemo(() => (refs ?? []).filter((r) => r.referrerKind === kind && labels.has(r.referrerId)), [refs, kind, labels]);
  const phoneKey = useMemo(
    () => [...new Set(mine.map((r) => normalizeContactNumber(r.clientPhone)).filter(Boolean))].sort().join(','),
    [mine],
  );

  useEffect(() => {
    if (!phoneKey) { setRead({ histories: {}, unread: new Set() }); return; }
    let alive = true;
    setHistoryFailed(false);
    fetchB2BBulk(phoneKey.split(','), [])
      .then((b) => { if (alive) setRead({ histories: b.histories, unread: b.unread }); })
      .catch(() => { if (alive) { setRead(null); setHistoryFailed(true); } });
    return () => { alive = false; };
  }, [phoneKey]);

  const rows = useMemo<ReferredRow[]>(() => mine.map((r) => {
    const phone = normalizeContactNumber(r.clientPhone);
    const h = read && !read.unread.has(phone) ? read.histories[phone] : undefined;
    const deals = dealsByPhone ? leadDeals([phone], dealsByPhone) : { carts: [], pis: [] };
    const open = [...deals.pis, ...deals.carts];
    return {
      key: `crm:${r.id}`, name: r.clientName, phone, note: r.note, referredOn: String(r.createdAt || '').slice(0, 10), addedBy: r.createdBy,
      referrerId: r.referrerId, referrer: labels.get(r.referrerId) ?? '', onStudio: r.onStudio,
      stage: referralStage(h, 0, open), orders: h?.orders ?? 0, enquiries: h?.enquiries ?? 0, lastOrder: h?.lastOrderDate || undefined, open,
    };
  }).sort((a, b) => b.referredOn.localeCompare(a.referredOn) || a.name.localeCompare(b.name)), [mine, read, dealsByPhone, labels]);

  const status = error ? 'failed' : refs === null ? 'pending' : 'ready';
  return { status, rows, error, historyFailed };
}
