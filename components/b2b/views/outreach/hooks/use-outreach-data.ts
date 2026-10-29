'use client';

import { InboundLead, OutreachLead } from '../../../models/mock-data';
import { WaitlistSignup } from '../../../models/outreach';
import { withJourney } from '../../../models/outreach/reminders';
import { nowIso } from '../utils';
import { fetchOutreachLeads, upsertOutreachLead, upsertOutreachLeads } from '@/lib/b2b';
import { fetchInboundForOutreach, fetchStudioWaitlist } from '@/lib/b2b/outreach';
import { useCallback, useEffect, useState } from 'react';

export function useOutreachData(by: string) {
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [inbound, setInbound] = useState<InboundLead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitlistSignup[] | null>(null);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    Promise.all([
      fetchOutreachLeads(),
      fetchInboundForOutreach().catch(() => null),
    ])
      .then(([o, i]) => { setLeads(o); setInbound(i); })
      .catch((e) => { setLoadFailed(true); setError(e instanceof Error ? e.message : 'Failed to load outreach leads'); })
      .finally(() => setLoading(false));
  }, []);

  const loadWaitlist = useCallback(() => {
    setWaitlistError(null);
    fetchStudioWaitlist()
      .then(setWaitlist)
      .catch((e) => { setWaitlist(null); setWaitlistError(e instanceof Error ? e.message : 'Studio Space did not answer'); });
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadWaitlist(); }, [loadWaitlist]);

  const save = useCallback(async (before: OutreachLead | null, after: OutreachLead): Promise<string | null> => {
    const at = nowIso();
    const next = withJourney(before, { ...after, value: Number(after.orderValue) || 0 }, by, at);
    setLeads((prev) => (before ? prev.map((l) => (l.id === next.id ? next : l)) : [next, ...prev]));
    const err = await upsertOutreachLead(next);
    if (err) setLeads((prev) => (before ? prev.map((l) => (l.id === before.id ? before : l)) : prev.filter((l) => l.id !== next.id)));
    return err;
  }, [by]);

  const createMany = useCallback(async (list: OutreachLead[], opts?: { onlyNew?: boolean }): Promise<string | null> => {
    const at = nowIso();
    const rows = list.map((l) => withJourney(null, l, by, at));
    const err = await upsertOutreachLeads(rows, opts);
    if (err) return err;
    if (opts?.onlyNew) load();
    else setLeads((prev) => [...rows, ...prev]);
    return null;
  }, [by, load]);

  const saveMany = useCallback(async (pairs: { before: OutreachLead; after: OutreachLead }[]): Promise<string | null> => {
    if (!pairs.length) return null;
    const at = nowIso();
    const next = new Map(pairs.map(({ before, after }) => [before.id, withJourney(before, { ...after, value: Number(after.orderValue) || 0 }, by, at)]));
    const prior = new Map(pairs.map(({ before }) => [before.id, before]));
    setLeads((prev) => prev.map((l) => next.get(l.id) ?? l));
    const err = await upsertOutreachLeads([...next.values()]);
    if (err) setLeads((prev) => prev.map((l) => prior.get(l.id) ?? l));
    return err;
  }, [by]);

  return { leads, inbound, loading, loadFailed, error, setError, load, waitlist, waitlistError, loadWaitlist, save, saveMany, createMany };
}
