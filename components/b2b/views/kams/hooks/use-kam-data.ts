'use client';

import { ClientEntity, contactNumbers, studioFirmOf } from '../../../models/client';
import { useClientAggregates } from '../../../hooks/use-client-aggregates';
import { fetchClients, upsertClient } from '@/lib/b2b';
import { CrmReferral, fetchReferrals } from '@/lib/b2b/referrals';
import { StudioAccessData, fetchStudioAccess } from '@/lib/b2b/studio-logins';
import { useCallback, useEffect, useState } from 'react';

export function useKamData() {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [referrals, setReferrals] = useState<CrmReferral[] | null>(null);
  const [studio, setStudio] = useState<StudioAccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [readingOrders, setReadingOrders] = useState(true);
  const [failed, setFailed] = useState<string[]>([]);
  const { load: loadAggregates, addPhones, metricsFor, historyFor } = useClientAggregates();

  const load = useCallback(async () => {
    setLoading(true);
    setReadingOrders(true);
    const bad: string[] = [];
    const [cl, refs, st] = await Promise.all([
      fetchClients().catch((e) => { console.error('[b2b] clients failed', e); bad.push('the client master'); return [] as ClientEntity[]; }),
      fetchReferrals().catch((e) => { console.error('[b2b] referrals failed', e); bad.push('the referral list'); return null; }),
      fetchStudioAccess().catch(() => null),
    ]);
    setClients(cl);
    setReferrals(refs);
    setStudio(st);
    setFailed(bad);
    setLoading(false);

    const ids = new Set(cl.map((c) => c.id));
    const referred = [
      ...(refs ?? []).filter((r) => r.referrerKind === 'client' && ids.has(r.referrerId)).map((r) => r.clientPhone),
      ...(st ? cl.flatMap((c) => (c.kam ? studioFirmOf(c, st.firms)?.referrals.map((r) => r.phone) ?? [] : [])) : []),
    ];
    const phones = [...new Set([...cl.flatMap((c) => contactNumbers(c.contacts)), ...referred])];
    await loadAggregates(phones).finally(() => setReadingOrders(false));
  }, [loadAggregates]);

  useEffect(() => { load(); }, [load]);

  const saveClient = useCallback(async (c: ClientEntity): Promise<string | null> => {
    const err = await upsertClient(c);
    if (err) return err;
    setClients((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    addPhones(contactNumbers(c.contacts));
    return null;
  }, [addPhones]);

  return {
    clients, referrals, studioFirms: studio?.firms ?? [], loading, readingOrders, failed,
    load, saveClient, metricsFor, historyFor,
  };
}
