'use client';

import { loadSetting, saveSetting } from '@/components/site-audit/shared/sb-client';
import { useCallback, useEffect, useState } from 'react';

import { TARGETS_KEY } from '../constants';
import { CategoryTargets, StoreTarget } from '../types';
import { coerceTargets } from '../utils';

export function useCategoryTargets() {
  const [targets, setTargets] = useState<CategoryTargets>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSetting(TARGETS_KEY)
      .then(r => { if (!cancelled) { setTargets(coerceTargets(r.value)); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(false); });
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (month: string, draft: Record<string, StoreTarget>) => {
    const fresh = await loadSetting(TARGETS_KEY);
    const merged = coerceTargets(fresh.value);
    const next: CategoryTargets = { ...merged, [month]: { ...(merged[month] || {}), ...draft } };
    await saveSetting(TARGETS_KEY, next, fresh.id);
    setTargets(next);
    return next;
  }, []);

  return { targets, loaded, save };
}
