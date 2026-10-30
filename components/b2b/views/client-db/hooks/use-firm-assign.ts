'use client';

import { ClientEntity } from '../../../models/client';
import { assignFirm, planFirmRoundRobin } from '../../../models/kam';
import { usePicked } from '../../../hooks/use-picked';
import { AssignTarget, isRoundRobin } from '../../../ui/assign-bar';
import { upsertClients } from '@/lib/b2b';
import { useState } from 'react';

export function useFirmAssign(clients: ClientEntity[], by: string, onSaved: (list: ClientEntity[]) => void) {
  const { picked, toggle, togglePage, pickAll, clear } = usePicked();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const assign = async (to: AssignTarget) => {
    const selected = clients.filter((c) => picked.has(c.id));
    const firms = !isRoundRobin(to) && selected.length === 1 ? selected : selected.filter((c) => !c.kam);
    const skipped = selected.length - firms.length;
    setNote(null);
    if (!firms.length) {
      setError('Every selected firm already has a KAM. Bulk assignment only takes firms with no KAM. Select one firm on its own and pick One person to move it.');
      return;
    }
    const at = new Date().toISOString();
    const how = isRoundRobin(to) ? 'round-robin' : 'manual';
    const plan = isRoundRobin(to) ? planFirmRoundRobin(firms, to.among, clients) : firms.map((item) => ({ item, rep: to }));
    const next = plan.map(({ item, rep }) => assignFirm(item, rep, by, at, how));
    setBusy(true);
    setError(null);
    const err = await upsertClients(next);
    setBusy(false);
    if (err) {
      setError(`Nothing was assigned: ${err}`);
      return;
    }
    onSaved(next);
    clear();
    if (skipped) setNote(`${firms.length} firm${firms.length === 1 ? '' : 's'} assigned. ${skipped} already had a KAM and stayed where ${skipped === 1 ? 'it was' : 'they were'}. Move an owned firm by selecting it on its own.`);
  };

  return { picked, toggle, togglePage, pickAll, clear, assign, busy, error, setError, note, setNote };
}
