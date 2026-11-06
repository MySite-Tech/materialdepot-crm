import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientEntity } from '../../../models/client';
import { previewClientImport, runClientImport } from '@/lib/b2b/client-import';
import type { ClientImportOutcome, ClientImportPlan, ClientImportScope } from '@/lib/b2b/client-import/types';
import { rowToClient } from '@/lib/b2b/mappers/client';

export type ImportBusy = ClientImportScope | 'preview' | null;

export function useClientImport(ready: boolean, onAdded: (clients: ClientEntity[]) => void) {
  const [last, setLast] = useState<ClientImportOutcome | null>(null);
  const [preview, setPreview] = useState<ClientImportPlan | null>(null);
  const [busy, setBusy] = useState<ImportBusy>(null);
  const [error, setError] = useState('');
  const started = useRef(false);

  const attempt = useCallback(async (step: Exclude<ImportBusy, null>, work: () => Promise<void>) => {
    setBusy(step);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const run = useCallback((scope: ClientImportScope) => attempt(scope, async () => {
    const out = await runClientImport(scope);
    setLast(out);
    setPreview(null);
    if (out.rows.length) onAdded(out.rows.map(rowToClient));
  }), [attempt, onAdded]);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    run('recent');
  }, [ready, run]);

  const check = () => attempt('preview', async () => setPreview(await previewClientImport('year')));

  return {
    last,
    preview,
    busy,
    error,
    check,
    confirm: () => run('year'),
    cancel: () => setPreview(null),
    dismiss: () => { setLast(null); setError(''); },
  };
}

export type ClientImporter = ReturnType<typeof useClientImport>;
