'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchChecklistDays, saveChecklistMarks } from '@/lib/store-checklist/api';
import type { ChecklistDay, ChecklistMarks, ChecklistValue } from '@/lib/store-checklist/types';
import { emptyDay } from '@/lib/store-checklist/utils';

const FLUSH_MS = 900;

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; at: string }
  | { status: 'error'; message: string };

export function useChecklistDay(storeCode: string | null, date: string, by: string) {
  const [day, setDay] = useState<ChecklistDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [pending, setPending] = useState<ChecklistMarks>({});
  const [reloads, setReloads] = useState(0);

  const pendingRef = useRef<ChecklistMarks>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<{ store: string; date: string } | null>(null);

  useEffect(() => {
    pendingRef.current = {};
    setPending({});
    setSaveState({ status: 'idle' });
    targetRef.current = storeCode ? { store: storeCode, date } : null;
    if (!storeCode) { setDay(null); setLoadError(null); return; }

    let live = true;
    setLoading(true);
    setLoadError(null);
    fetchChecklistDays([storeCode], date, date)
      .then((days) => {
        if (!live) return;
        setDay(days[0] ?? emptyDay(storeCode, date));
      })
      .catch((err: unknown) => {
        if (!live) return;
        setDay(null);
        setLoadError(err instanceof Error ? err.message : 'Could not load this checklist');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [storeCode, date, reloads]);

  const flushRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async () => {
    const target = targetRef.current;
    const batch = pendingRef.current;
    const ids = Object.keys(batch);
    if (!target || ids.length === 0) return;

    setSaveState({ status: 'saving' });
    try {
      const saved = await saveChecklistMarks(target.store, target.date, batch, by);
      if (targetRef.current?.store !== target.store || targetRef.current?.date !== target.date) return;
      setDay(saved);
      const remaining: ChecklistMarks = {};
      for (const [id, mark] of Object.entries(pendingRef.current)) {
        if (batch[id] !== mark) remaining[id] = mark;
      }
      pendingRef.current = remaining;
      setPending(remaining);
      if (Object.keys(remaining).length > 0) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { void flushRef.current(); }, FLUSH_MS);
        return;
      }
      setSaveState({ status: 'saved', at: new Date().toISOString() });
    } catch (err) {
      setSaveState({ status: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    }
  }, [by]);

  useEffect(() => { flushRef.current = flush; }, [flush]);

  const queue = useCallback((next: ChecklistMarks) => {
    pendingRef.current = { ...pendingRef.current, ...next };
    setPending(pendingRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flush(); }, FLUSH_MS);
  }, [flush]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const setValue = useCallback((itemId: string, v: ChecklistValue) => {
    const current = pendingRef.current[itemId] ?? day?.items?.[itemId];
    queue({ [itemId]: { v, c: current?.c ?? '' } });
  }, [day, queue]);

  const setComment = useCallback((itemId: string, c: string) => {
    const current = pendingRef.current[itemId] ?? day?.items?.[itemId];
    if (!current?.v) return;
    queue({ [itemId]: { v: current.v, c } });
  }, [day, queue]);

  const setMany = useCallback((itemIds: readonly string[], v: ChecklistValue) => {
    if (itemIds.length === 0) return;
    const next: ChecklistMarks = {};
    for (const id of itemIds) {
      const current = pendingRef.current[id] ?? day?.items?.[id];
      next[id] = { v, c: current?.c ?? '' };
    }
    queue(next);
  }, [day, queue]);

  return {
    day,
    loading,
    loadError,
    saveState,
    pending,
    setValue,
    setComment,
    setMany,
    retry: flush,
    reload: () => setReloads((n) => n + 1),
    unsavedCount: Object.keys(pending).length,
  };
}
