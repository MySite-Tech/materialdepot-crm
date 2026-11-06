'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useMonthReport<T>(
  read: (from: string, to: string, fresh: boolean) => Promise<T>,
  from: string,
  to: string,
  enabled: boolean,
  refreshKey: number,
  failure: string,
) {
  const key = `${from}|${to}`;
  const [result, setResult] = useState<{ key: string; report: T | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState(enabled);
  const latest = useRef(0);
  const seenRefresh = useRef(refreshKey);

  const load = useCallback(async (fresh: boolean) => {
    const run = ++latest.current;
    setBusy(true);
    try {
      const report = await read(from, to, fresh);
      if (run === latest.current) setResult({ key, report, error: null });
    } catch (e) {
      if (run === latest.current) setResult({ key, report: null, error: e instanceof Error ? e.message : failure });
    } finally {
      if (run === latest.current) setBusy(false);
    }
  }, [read, from, to, key, failure]);

  useEffect(() => {
    if (!enabled) return;
    const fresh = refreshKey !== seenRefresh.current;
    seenRefresh.current = refreshKey;
    load(fresh);
  }, [enabled, load, refreshKey]);

  const current = result?.key === key ? result : null;
  return { report: current?.report ?? null, error: current?.error ?? null, busy, reload: () => load(true) };
}
