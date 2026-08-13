'use client';

/* "Linked installation" — the BM states which installation job card belongs to
   this site audit.

   Nothing in the data can decide this on its own. An installation and its audit
   share only `pi` (the lead id), and when a BM raised them under different ids
   the rows have nothing in common but a phone number — which a client with two
   unrelated projects also shares. So the link is declared here rather than
   guessed, and stored in app_settings (see jobCardLinks.ts) — one audit can
   feed several installations.

   The link itself lives outside the order rows, but each link and unlink is
   still written into the installation's own activity log, so the change shows
   up where an SM or installer would look for it. That write re-fetches the log
   first, the same guard the room-SKU editor uses: the field apps autosave that
   blob. */

import { useCallback, useEffect, useState } from 'react';
import { fmtDateA, sbGet, sbPatch } from './siteAuditShared';
import { linkInstall, loadLinkedInstallPis, unlinkInstall } from './jobCardLinks';

const INSTALL_COLS = 'id,pi,customer_name,phone,status,delivery_date';

type Install = { id: string; pi: string; customer_name?: string; phone?: string; status?: string; delivery_date?: string | null };

function label(i: Install) {
  return [i.customer_name || '—', i.delivery_date ? fmtDateA(i.delivery_date) : 'no delivery date', i.status || ''].filter(Boolean).join(' · ');
}

async function appendLog(installId: string, text: string, who: string) {
  const rows = await sbGet('install_orders?id=eq.' + installId + '&select=log');
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return [...(row && Array.isArray(row.log) ? row.log : []), { t: text, d: new Date().toISOString(), by: 'manual' as const, who }];
}

export default function LinkInstallSection({ auditPi, auditPhone, attribution, onMsg }: {
  auditPi: string;
  auditPhone?: string;
  attribution: string;
  onMsg: (m: string) => void;
}) {
  const [linked, setLinked] = useState<Install[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Install[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const pis = await loadLinkedInstallPis(auditPi);
    if (!pis.length) { setLinked([]); return; }
    /* The link stores lead ids only; the rows behind them are read here so the
       BM sees who and when, not just an id. A linked order that was since
       deleted simply drops out of the list. */
    const rows = await sbGet(
      'install_orders?pi=in.(' + pis.map((p) => '"' + p.replace(/"/g, '') + '"').join(',')
      + ')&status=neq.deleted&select=' + INSTALL_COLS,
    );
    setLinked(Array.isArray(rows) ? rows : []);
  }, [auditPi]);

  useEffect(() => { load(); }, [load]);

  /* Opening the picker suggests the obvious candidates first — the same lead id,
     then the same phone — but they are only suggestions; the BM confirms. */
  const suggest = useCallback(async () => {
    const clauses = ['pi.eq.' + auditPi];
    const ph = String(auditPhone || '').replace(/\D/g, '').slice(-10);
    if (ph.length === 10) clauses.push('phone.like.*' + ph + '*');
    const rows = await sbGet('install_orders?or=(' + clauses.join(',') + ')&status=neq.deleted&order=created_at.desc&limit=10&select=' + INSTALL_COLS);
    setResults(Array.isArray(rows) ? rows : []);
  }, [auditPi, auditPhone]);

  async function search() {
    const term = q.trim();
    if (!term) { suggest(); return; }
    const enc = encodeURIComponent(term);
    const rows = await sbGet(
      'install_orders?or=(pi.ilike.*' + enc + '*,customer_name.ilike.*' + enc + '*,phone.ilike.*' + enc + '*)'
      + '&status=neq.deleted&order=created_at.desc&limit=15&select=' + INSTALL_COLS,
    );
    setResults(Array.isArray(rows) ? rows : []);
  }

  async function link(i: Install) {
    setBusy(true);
    setErr('');
    try {
      await linkInstall(auditPi, i.pi, attribution);
      const log = await appendLog(String(i.id), 'Linked to site audit ' + auditPi, attribution);
      await sbPatch('install_orders', String(i.id), { log });
      setPicking(false);
      setQ('');
      setResults(null);
      await load();
      onMsg('Installation ' + i.pi + ' linked to this audit');
    } catch (e: any) {
      setErr(e?.message || 'Could not link — try again');
    }
    setBusy(false);
  }

  async function unlink(i: Install) {
    setBusy(true);
    setErr('');
    try {
      await unlinkInstall(auditPi, i.pi);
      const log = await appendLog(String(i.id), 'Unlinked from site audit ' + auditPi, attribution);
      await sbPatch('install_orders', String(i.id), { log });
      await load();
      onMsg('Installation ' + i.pi + ' unlinked');
    } catch (e: any) {
      setErr(e?.message || 'Could not unlink — try again');
    }
    setBusy(false);
  }

  return (
    <>
      {linked === null ? (
        <div className="text-[12.5px] text-gray-400">Loading…</div>
      ) : !linked.length ? (
        <div className="text-[12.5px] text-gray-400">No installation linked yet.</div>
      ) : (
        linked.map((i) => (
          <div key={i.id} className="mb-1.5 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[12px] font-semibold text-gray-900">{i.pi}</span>
              <span className="block truncate text-[11.5px] text-gray-400">{label(i)}</span>
            </span>
            <button disabled={busy} className="shrink-0 text-[11.5px] font-semibold text-red-600 disabled:opacity-50" onClick={() => unlink(i)}>Unlink</button>
          </div>
        ))
      )}

      {picking ? (
        <div className="mt-2 rounded-lg border border-gray-200 p-2.5">
          <div className="flex gap-2">
            <input
              value={q}
              autoFocus
              placeholder="Search by lead id, customer or phone"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
              className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#0F766E]"
            />
            <button className="shrink-0 rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-semibold text-white" onClick={search}>Search</button>
            <button className="shrink-0 text-[12px] font-semibold text-gray-500" onClick={() => { setPicking(false); setResults(null); setQ(''); }}>Cancel</button>
          </div>
          {results === null ? null : !results.length ? (
            <div className="mt-2 text-[12px] text-gray-400">No installation orders match.</div>
          ) : (
            <div className="mt-2">
              {results.map((i) => (
                <button
                  key={i.id}
                  disabled={busy}
                  onClick={() => link(i)}
                  className="flex w-full items-center gap-2 border-b border-gray-100 py-2 text-left last:border-b-0 disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] font-semibold text-gray-900">{i.pi}</span>
                    <span className="block truncate text-[11.5px] text-gray-400">{label(i)}</span>
                  </span>
                  <span className="shrink-0 text-[11.5px] font-semibold text-blue-700">Link</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          className="mt-1.5 text-[12.5px] font-semibold text-blue-700"
          onClick={() => { setPicking(true); setResults(null); suggest(); }}
        >
          {linked && linked.length ? '+ Link another installation' : '+ Link an installation'}
        </button>
      )}

      {err ? <div className="mt-1.5 text-[11.5px] text-red-600">{err}</div> : null}
    </>
  );
}
