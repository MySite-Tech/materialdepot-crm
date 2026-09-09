'use client';

import { sbGet } from '../../../shared';
import { genInstallPDFSM } from '../../pdf';
import { InstallOrder, Installer } from '../../types';
import { useState } from 'react';

export function DownloadJobCardBtn({ order: o, sjId, installers, toast, partial }: { order: InstallOrder; sjId: string; installers: Installer[]; toast: (m: string) => void; partial?: boolean }) {
  const IDLE = partial ? '📥 Download partial Job Card PDF' : '📥 Download Job Card PDF';
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(IDLE);
  return (
    <button
      className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-xs font-semibold mb-2.5 disabled:opacity-60"
      disabled={busy}
      onClick={async () => {
        setBusy(true); setLabel('Building…');
        try {
          const rows = await sbGet('install_orders?id=eq.' + o.id + '&select=subjobs');
          const freshSj = ((Array.isArray(rows) && rows[0] && rows[0].subjobs) || []).find((s: any) => s.id === sjId);
          const sj = o.subjobs!.find((s) => s.id === sjId)!;
          const jobcard = (freshSj && freshSj.jobcard) || (sj && sj.jobcard) || null;
          if (!jobcard) { toast('Job card not submitted yet — installer must fill it in on site first'); setBusy(false); setLabel(IDLE); return; }
          await genInstallPDFSM(o, freshSj || sj, jobcard, installers);
        } catch (e: any) {
          toast('PDF failed: ' + (e?.message || 'unknown error'));
        }
        setBusy(false); setLabel(IDLE);
      }}
    >
      {label}
    </button>
  );
}
