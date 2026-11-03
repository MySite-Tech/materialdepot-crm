'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { syncInbound } from '@/lib/b2b/team';
import { INBOUND_ROTATION_INTERVAL_MS, INBOUND_ROTATION_RETRY_NOTE } from '@/lib/b2b/team/constants';
import type { SyncOutcome } from '@/lib/b2b/team/types';

export interface SyncNote {
  tone: 'ok' | 'warn';
  text: string;
}

const plural = (n: number) => `${n} new lead${n === 1 ? '' : 's'}`;

function noteFor(r: SyncOutcome): SyncNote | null {
  const parts: string[] = [];
  if (r.imported) parts.push(`${plural(r.imported)} came in from Kylas`);
  if (r.assigned.length) parts.push(`${plural(r.assigned.length)} shared out round robin`);
  if (r.failed.length) {
    return { tone: 'warn', text: `Round robin could not assign ${r.failed.length}: ${r.failed[0].error}. ${INBOUND_ROTATION_RETRY_NOTE}` };
  }
  return parts.length ? { tone: 'ok', text: `${parts.join(', ')} just now.` } : null;
}

export function useInboundSync(ready: boolean, onChanged: () => void) {
  const [note, setNote] = useState<SyncNote | null>(null);
  const [syncing, setSyncing] = useState(false);
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const running = useRef(false);

  const run = useCallback(async (full: boolean) => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    try {
      const r = await syncInbound(full);
      const next = noteFor(r);
      setNote((prev) => next ?? (full ? { tone: 'ok', text: `Up to date with Kylas: ${r.checked} leads checked, none missing.` } : prev?.tone === 'warn' ? null : prev));
      if (r.imported || r.assigned.length) changed.current();
    } catch (e) {
      setNote({ tone: 'warn', text: `Could not sync with Kylas: ${e instanceof Error ? e.message : String(e)}. ${INBOUND_ROTATION_RETRY_NOTE}` });
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    run(false);
    const timer = setInterval(() => { if (!document.hidden) run(false); }, INBOUND_ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ready, run]);

  return { note, syncing, syncNow: () => run(true) };
}
