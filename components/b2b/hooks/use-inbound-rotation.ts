'use client';

import { useEffect, useRef, useState } from 'react';
import { runInboundRotation } from '@/lib/b2b/team';
import { INBOUND_ROTATION_INTERVAL_MS, INBOUND_ROTATION_RETRY_NOTE } from '@/lib/b2b/team/constants';

export interface RotationNote {
  tone: 'ok' | 'warn';
  text: string;
}

export function useInboundRotation(ready: boolean, onAssigned: () => void): RotationNote | null {
  const [note, setNote] = useState<RotationNote | null>(null);
  const assigned = useRef(onAssigned);
  assigned.current = onAssigned;

  useEffect(() => {
    if (!ready) return;
    let running = false;
    const run = () => {
      if (running) return;
      running = true;
      runInboundRotation()
        .then((r) => {
          if (r.failed.length) {
            setNote({ tone: 'warn', text: `Round robin could not assign ${r.failed.length} lead${r.failed.length === 1 ? '' : 's'}: ${r.failed[0].error}. ${INBOUND_ROTATION_RETRY_NOTE}` });
          } else if (r.assigned.length) {
            setNote({ tone: 'ok', text: `${r.assigned.length} new lead${r.assigned.length === 1 ? '' : 's'} shared out round robin just now.` });
          } else {
            setNote((prev) => (prev?.tone === 'warn' ? null : prev));
          }
          if (r.assigned.length) assigned.current();
        })
        .catch((e) => setNote({ tone: 'warn', text: `Round robin did not run: ${e instanceof Error ? e.message : String(e)}. ${INBOUND_ROTATION_RETRY_NOTE}` }))
        .finally(() => { running = false; });
    };
    run();
    const timer = setInterval(() => { if (!document.hidden) run(); }, INBOUND_ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ready]);

  return note;
}
