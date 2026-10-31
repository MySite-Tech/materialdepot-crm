'use client';

import { useCallback, useState } from 'react';

export function usePicked() {
  const [picked, setPicked] = useState<Set<string>>(new Set());

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

  const pickAll = useCallback((ids: string[]) => setPicked(new Set(ids)), []);
  const clear = useCallback(() => setPicked(new Set()), []);

  return { picked, toggle, togglePage, pickAll, clear };
}
