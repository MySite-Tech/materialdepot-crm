'use client';

import { CLIENT_COLUMNS, COLUMNS_HIDDEN_AT_FIRST, COLUMNS_STORAGE_KEY } from '../constants';
import { ClientColumn } from '../types';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useClientColumns() {
  const [hidden, setHidden] = useState<ClientColumn[]>(COLUMNS_HIDDEN_AT_FIRST);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (saved) setHidden(JSON.parse(saved));
    } catch { /* blocked storage keeps the defaults */ }
  }, []);

  const visible = useMemo(() => new Set(CLIENT_COLUMNS.map((c) => c.key).filter((k) => !hidden.includes(k))), [hidden]);

  const setVisible = useCallback((keys: ClientColumn[]) => {
    const next = CLIENT_COLUMNS.map((c) => c.key).filter((k) => !keys.includes(k));
    setHidden(next);
    try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next)); } catch { /* blocked storage: this visit only */ }
  }, []);

  return { visible, setVisible };
}
