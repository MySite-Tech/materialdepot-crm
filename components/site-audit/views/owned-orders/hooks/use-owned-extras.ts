'use client';

import { WpRow } from '../../../coe-ops/wallpaper/track';
import { BmProfile } from '../../bm/types';
import { loadOwnedInstalls, loadOwnedWallpapers } from '../data';
import { OwnedInstall } from '../types';
import { useEffect, useState } from 'react';

export function useOwnedExtras(people: BmProfile[], deps: string) {
  const [installs, setInstalls] = useState<OwnedInstall[]>([]);
  const [wallpapers, setWallpapers] = useState<WpRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const run = () => Promise.all([loadOwnedInstalls(people), loadOwnedWallpapers(people)])
      .then(([i, w]) => { if (!alive) return; setInstalls(i); setWallpapers(w); setLoading(false); })
      .catch(() => { if (alive) setLoading(false); });
    run();
    const tid = setInterval(() => { if (!document.hidden) run(); }, 30000);
    return () => { alive = false; clearInterval(tid); };
    // `deps` is a stable key for `people` — the array identity changes on every
    // render of the parent, which would otherwise re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);

  return { installs, wallpapers, loading };
}
