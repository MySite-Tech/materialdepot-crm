'use client';

import { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { CreditInput, OrderCredit, clearOrderCredit, creditKey, fetchOrderCredits, saveOrderCredit } from '@/lib/b2b/revenue';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { CreditPerson, CreditsState, OrderCreditsApi, OrderCreditsContext } from './context';

export function OrderCreditsProvider({ team, viewer, children }: { team: B2BTeamLoad; viewer: Viewer; children: ReactNode }) {
  const [credits, setCredits] = useState<Map<string, OrderCredit> | null>(null);
  const [state, setState] = useState<CreditsState>('idle');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState('loading');
    fetchOrderCredits()
      .then((list) => { setCredits(new Map(list.map((c) => [c.enquiryId, c]))); setState('ready'); setError(null); })
      .catch((e) => { setState('failed'); setError(e instanceof Error ? e.message : 'Order credits could not be read'); started.current = false; });
  }, []);

  const save = useCallback(async (input: CreditInput) => {
    const saved = await saveOrderCredit(input);
    setCredits((cur) => new Map(cur ?? []).set(saved.enquiryId, saved));
  }, []);

  const clear = useCallback(async (enquiryId: string) => {
    await clearOrderCredit(enquiryId);
    setCredits((cur) => {
      const next = new Map(cur ?? []);
      next.delete(creditKey(enquiryId));
      return next;
    });
  }, []);

  const people = useMemo<CreditPerson[]>(() => team.members
    .filter((m) => m.active)
    .map((m) => ({ name: m.name, phone: m.phone, team: m.team }))
    .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name)), [team.members]);

  const api = useMemo<OrderCreditsApi>(() => ({
    credits, state, error, load, canEdit: viewer.isManager, people, save, clear,
  }), [credits, state, error, load, viewer.isManager, people, save, clear]);

  return <OrderCreditsContext.Provider value={api}>{children}</OrderCreditsContext.Provider>;
}
