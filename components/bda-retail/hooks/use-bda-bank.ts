'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { assignLeads, claimLead, fetchBank, logCall, releaseLead, savePlan } from '@/lib/bda-retail/api';
import type { AccessRow, BankState, BdaAccess, BdaPerson, CallOutcome, Claim, Priority } from '@/lib/bda-retail/types';
import { leadViews } from '@/lib/bda-retail/utils';

const withClaim = (b: BankState, key: string, claim: Claim | null): BankState => ({
  ...b,
  leads: b.leads.map((l) => (l.key === key ? { ...l, claim } : l)),
});

export function useBdaBank() {
  const [bank, setBank] = useState<BankState | null>(null);
  const [access, setAccess] = useState<BdaAccess | null>(null);
  const [admins, setAdmins] = useState<AccessRow[]>([]);
  const [bdas, setBdas] = useState<BdaPerson[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchBank();
      setBank(res.bank);
      setAccess(res.access);
      setAdmins(res.admins);
      setBdas(res.bdas);
      setError('');
    } catch (err) {
      setError(`The lead bank did not load: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const views = useMemo(() => (bank ? leadViews(bank) : []), [bank]);

  const claim = useCallback(async (key: string) => {
    const c = await claimLead(key);
    setBank((b) => (b ? withClaim(b, key, c) : b));
    return c;
  }, []);

  const release = useCallback(async (key: string) => {
    await releaseLead(key);
    setBank((b) => (b ? withClaim(b, key, null) : b));
  }, []);

  const call = useCallback(async (key: string, outcome: CallOutcome, note: string, followUpOn: string) => {
    const c = await logCall(key, outcome, note, followUpOn);
    setBank((b) => {
      if (!b) return b;
      const lead = b.leads.find((l) => l.key === key);
      const next = lead?.claim ? b : withClaim(b, key, { by: c.by, byPhone: c.byPhone, at: c.at });
      return { ...next, calls: [...next.calls, c] };
    });
  }, []);

  const assign = useCallback(async (assignments: Array<{ key: string; phone: string }>, step: (s: string) => void) => {
    const assigned = await assignLeads(assignments, step);
    const names = new Map(bdas.map((b) => [b.phone, b.name]));
    const to = new Map(assignments.map((a) => [a.key, a.phone]));
    const at = new Date().toISOString();
    setBank((b) => (b ? {
      ...b,
      leads: b.leads.map((l) => (to.has(l.key) ? { ...l, claim: { by: names.get(to.get(l.key)!) ?? '', byPhone: to.get(l.key)!, at } } : l)),
    } : b));
    return assigned;
  }, [bdas]);

  const plan = useCallback(async (month: string, priorities: Priority[] | null) => {
    await savePlan(month, priorities);
    setBank((b) => {
      if (!b) return b;
      const next = { ...b.plan };
      if (priorities) next[month] = priorities;
      else delete next[month];
      return { ...b, plan: next };
    });
  }, []);

  return { bank, access, admins, bdas, assign, views, error, loading, reload: load, claim, release, call, plan };
}
