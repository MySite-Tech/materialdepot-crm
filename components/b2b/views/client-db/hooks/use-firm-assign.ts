'use client';

import { ClientEntity } from '../../../models/client';
import { assignFirm, planFirmRoundRobin } from '../../../models/kam';
import { Rep } from '../../../models/outreach/intake';
import { AssignTarget } from '../../../ui/assign-bar';
import { upsertClients } from '@/lib/b2b';
import { useCallback, useState } from 'react';

export function useFirmAssign(clients: ClientEntity[], kams: Rep[], by: string, onSaved: (list: ClientEntity[]) => void) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const toggle = useCallback((id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }), []);

  const togglePage = useCallback((ids: string[]) => setPicked((p) => {
    const all = ids.length > 0 && ids.every((id) => p.has(id));
    const n = new Set(p);
    for (const id of ids) { if (all) n.delete(id); else n.add(id); }
    return n;
  }), []);

  const clear = useCallback(() => setPicked(new Set()), []);

  const assign = async (to: AssignTarget) => {
    const selected = clients.filter((c) => picked.has(c.id));
    const firms = to === 'round-robin' ? selected.filter((c) => !c.kam) : selected;
    const skipped = selected.length - firms.length;
    setNote(null);
    if (!firms.length) {
      setError('Every selected firm already has a KAM. Round robin only shares out firms with no KAM — pick a name to move one.');
      return;
    }
    const at = new Date().toISOString();
    const how = to === 'round-robin' ? 'round-robin' : 'manual';
    const plan = to === 'round-robin' ? planFirmRoundRobin(firms, kams, clients) : firms.map((item) => ({ item, rep: to }));
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
    setPicked(new Set());
    if (skipped) setNote(`${firms.length} firm${firms.length === 1 ? '' : 's'} shared out. ${skipped} already had a KAM and stayed where they were.`);
  };

  return { picked, toggle, togglePage, clear, assign, busy, error, setError, note, setNote };
}
