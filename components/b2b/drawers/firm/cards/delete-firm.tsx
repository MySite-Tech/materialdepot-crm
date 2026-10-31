'use client';

import { ClientEntity } from '../../../models/client';
import { btnGhost, inputCls } from '../../../constants/ui';
import { useState } from 'react';

export function DeleteFirm({ client, onDelete }: { client: ClientEntity; onDelete: (c: ClientEntity) => Promise<string | null> }) {
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = client.company.trim();

  const run = async () => {
    setBusy(true);
    setError('');
    const err = await onDelete(client);
    setBusy(false);
    if (err) setError(err);
  };

  if (!asking) {
    return (
      <div className="text-right">
        <button onClick={() => setAsking(true)} className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer">Delete this firm</button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-[12px] text-red-800 mb-2">
        This removes the firm, its contacts, GSTs and notes from the Client Database, and it cannot be undone. To combine two firms, use Merge instead. Orders stay in Material Depot.
      </p>
      <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${name} to confirm`} className={inputCls} />
      {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={() => { setAsking(false); setTyped(''); }} className={btnGhost}>Cancel</button>
        <button onClick={run} disabled={busy || !name || typed.trim() !== name} className="px-3 py-1.5 rounded-md bg-red-600 text-white text-[12px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default">
          {busy ? 'Deleting…' : 'Delete firm'}
        </button>
      </div>
    </div>
  );
}
