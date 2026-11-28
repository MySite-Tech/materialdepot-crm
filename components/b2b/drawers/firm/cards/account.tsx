'use client';

import { LABEL_CLS, LINK_CLS } from '../constants';
import { fmtDate } from '../utils';
import { ClientEntity } from '../../../models/client';
import { assignFirm, currentAssignments } from '../../../models/kam';
import { liveRepName, repNames, sameRep } from '../../../models/outreach/handover';
import { Rep } from '../../../models/outreach/intake';
import { SectionCard } from '../../../ui/inbound-chips';
import { btnPrimary } from '../../../constants/ui';
import { useEffect, useRef, useState } from 'react';

export function AccountCard({ client, reassignReason, assignAs, kams, picking, onPicking, onSave }: {
  client: ClientEntity;
  reassignReason: string;
  assignAs?: string;
  kams: Rep[];
  picking: boolean;
  onPicking: (open: boolean) => void;
  onSave: (c: ClientEntity) => Promise<string | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reassigning = picking && assignAs !== undefined;
  const held = client.kam ? liveRepName(client.kam, kams) : '';
  const [nextKam, setNextKam] = useState(held);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const history = [...currentAssignments(client)].reverse();

  useEffect(() => {
    if (reassigning) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [reassigning]);

  const reassign = async () => {
    if (nextKam ? sameRep(nextKam, client.kam) : !client.kam) { onPicking(false); return; }
    setBusy(true);
    setError('');
    const at = new Date().toISOString();
    const err = await onSave(nextKam
      ? assignFirm(client, kams.find((k) => k.name === nextKam) ?? { name: nextKam }, assignAs ?? '', at, 'manual', reassignReason)
      : { ...client, kam: undefined, assignments: [...(client.assignments || []), { kam: '', at, by: assignAs, reason: reassignReason }] });
    setBusy(false);
    if (err) setError(err); else onPicking(false);
  };

  return (
    <SectionCard title="Account">
      <div ref={ref} className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${client.kam ? 'bg-[#0F766E] text-white' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
            {client.kam ? client.kam.slice(0, 2).toUpperCase() : '?'}
          </span>
          <div className="min-w-0">
            <div className={LABEL_CLS}>Key account manager</div>
            <div className="text-[13px] font-semibold text-gray-900 truncate">{client.kam || <span className="text-amber-700">Unassigned</span>}</div>
          </div>
        </div>
        {reassigning ? (
          <div className="flex items-center gap-2">
            <select value={nextKam} onChange={(e) => setNextKam(e.target.value)} className="px-2 py-1 text-[12px] border border-gray-200 rounded-md bg-white">
              <option value="">Unassigned</option>
              {repNames(kams, [client.kam]).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button onClick={reassign} disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => { onPicking(false); setNextKam(held); }} className="text-[12px] text-gray-500 cursor-pointer">Cancel</button>
          </div>
        ) : assignAs !== undefined && (
          <button onClick={() => onPicking(true)} className={LINK_CLS}>{client.kam ? 'Reassign' : 'Assign'}</button>
        )}
      </div>
      {error && <p className="text-[12px] text-red-600 mt-2">Could not save: {error}</p>}

      {!!history.length && (
        <div className="mt-3">
          <div className={`${LABEL_CLS} mb-1`}>Assignment history</div>
          <ol className="flex flex-col gap-0.5">
            {history.map((a, i) => (
              <li key={i} className="text-[12px] text-gray-500">
                <span className="font-medium text-gray-800">{a.kam || 'Unassigned'}</span> · {fmtDate(a.at)}
                {a.reason && <span className="text-gray-400"> · {a.reason}</span>}
                {a.status && <span className="text-gray-400"> · {a.status}{a.rejectReason ? `: ${a.rejectReason}` : ''}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {client.remarks && (
        <div className="mt-3">
          <div className={`${LABEL_CLS} mb-1`}>Remarks</div>
          <p className="text-[12px] text-gray-700 break-words whitespace-pre-line">{client.remarks}</p>
        </div>
      )}

      {!!(client.mergedFrom || []).length && (
        <div className="mt-3">
          <div className={`${LABEL_CLS} mb-1`}>Merged from</div>
          {(client.mergedFrom || []).map((m) => (
            <div key={m.id} className="text-[12px] text-gray-500">
              {m.company} · {fmtDate(m.mergedAt)}{m.mergedBy ? ` · ${m.mergedBy}` : ''}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
