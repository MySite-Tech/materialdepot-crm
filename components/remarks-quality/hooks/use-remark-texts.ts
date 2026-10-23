import { useCallback, useRef, useState } from 'react';

import { REMARK_TEXTS_BATCH, fetchRemarkTexts } from '@/lib/api';

export function useRemarkTexts() {
  const texts = useRef(new Map<number, string>());
  const failed = useRef(new Set<number>());
  const inflight = useRef(new Map<number, Promise<void>>());
  const [version, setVersion] = useState(0);

  const ensure = useCallback(async (ids: number[], onProgress?: (done: number, total: number) => void) => {
    const missing = [...new Set(ids)].filter(id => !texts.current.has(id));
    const others = new Set(missing.flatMap(id => inflight.current.get(id) ?? []));
    const need = missing.filter(id => !inflight.current.has(id));
    const run = (async () => {
      for (let i = 0; i < need.length; i += REMARK_TEXTS_BATCH) {
        const chunk = need.slice(i, i + REMARK_TEXTS_BATCH);
        onProgress?.(i, need.length);
        try {
          const got = await fetchRemarkTexts(chunk);
          for (const id of chunk) { texts.current.set(id, got[String(id)] ?? ''); failed.current.delete(id); }
        } catch {
          for (const id of chunk) failed.current.add(id);
        }
      }
    })();
    for (const id of need) inflight.current.set(id, run);
    await run;
    for (const id of need) inflight.current.delete(id);
    if (need.length) setVersion(v => v + 1);
    await Promise.all(others);
  }, []);

  const textOf = useCallback((id: number): string | null | undefined => {
    if (texts.current.has(id)) return texts.current.get(id);
    return failed.current.has(id) ? null : undefined;
  }, []);

  return { ensure, textOf, version };
}
