'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmtINR } from '../../models/mock-data';
import { sameRep } from '../../models/outreach/handover';
import { fmtDay } from '../../ui/inbound-chips';
import { EC_VISIT_STATUSES, EcVisit, EcVisitStatus, checkAssisted, fetchEcVisits, saveEcVisit } from '@/lib/b2b/ec-visits';
import { B2B_TEAM_LABEL } from '@/lib/b2b/team/constants';
import type { Viewer } from '@/lib/b2b/team/types';
import { EC_LENSES, EcLens, assistedTotal, lensMatches } from './utils';

const PAGE_SIZE = 25;
const CHECK_CONCURRENCY = 2;

export default function EcDirected({ viewer }: { viewer: Viewer }) {
  const [all, setAll] = useState<EcVisit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lens, setLens] = useState<EcLens>('all');
  const [ec, setEc] = useState('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  useEffect(() => {
    fetchEcVisits({ kind: 'redirect' })
      .then((list) => setAll([...list].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'EC redirects did not load'));
  }, []);

  const mine = useMemo(
    () => (all || []).filter((v) => viewer.isManager || sameRep(v.scheduledBy, viewer.name)),
    [all, viewer.isManager, viewer.name],
  );
  const ecs = useMemo(() => [...new Set(mine.map((v) => v.branch))].sort(), [mine]);
  const scoped = useMemo(() => mine.filter((v) => ec === 'all' || v.branch === ec), [mine, ec]);
  const rows = useMemo(() => scoped.filter((v) => lensMatches(v, lens)), [scoped, lens]);
  const total = assistedTotal(scoped);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [lens, ec]);

  const replace = (v: EcVisit) => setAll((cur) => (cur || []).map((x) => (x.id === v.id ? v : x)));
  const mark = (id: string, on: boolean) => setBusy((cur) => { const n = new Set(cur); if (on) n.add(id); else n.delete(id); return n; });

  const check = async (v: EcVisit) => {
    mark(v.id, true);
    setRowError(({ [v.id]: _, ...rest }) => rest);
    try {
      replace(await saveEcVisit({ ...v, assisted: await checkAssisted(v) }));
    } catch (e) {
      setRowError((cur) => ({ ...cur, [v.id]: e instanceof Error ? e.message : 'Check failed' }));
    } finally {
      mark(v.id, false);
    }
  };

  const checkAll = async () => {
    setCheckingAll(true);
    const queue = [...scoped];
    await Promise.all(Array.from({ length: CHECK_CONCURRENCY }, async () => {
      for (let v = queue.shift(); v; v = queue.shift()) await check(v);
    }));
    setCheckingAll(false);
  };

  const setStatus = async (v: EcVisit, status: EcVisitStatus) => {
    mark(v.id, true);
    try { replace(await saveEcVisit({ ...v, status })); }
    catch (e) { setRowError((cur) => ({ ...cur, [v.id]: e instanceof Error ? e.message : 'Save failed' })); }
    finally { mark(v.id, false); }
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-[18px] font-bold text-gray-900">EC Directed</h2>
        <p className="text-[12.5px] text-gray-500 mt-0.5 max-w-3xl">
          Every lead Inbound, Outreach or KAM sent to an Experience Centre. <strong>Assisted revenue</strong> is what those numbers ordered at
          that EC since the redirect. It is also in the EC&apos;s own revenue, so it is a measure of B2B&apos;s contribution, never added on top.
          {' '}{viewer.isManager ? 'You see every redirect.' : 'You see the redirects you made.'}
        </p>
      </div>

      {loadError && (
        <p className="text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
          Redirects did not load: {loadError}. They need b2b-backend migration 0023.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {EC_LENSES.map((l) => (
          <button key={l.key} onClick={() => setLens(l.key)}
            className={`text-left rounded-lg border px-3 py-2.5 bg-white ${lens === l.key ? 'border-[#1A1A1A] ring-1 ring-[#1A1A1A]' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{l.label}</div>
            <div className="text-[22px] font-bold text-gray-900">{all ? scoped.filter((v) => lensMatches(v, l.key)).length : loadError ? 'Unknown' : '…'}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Assisted revenue</div>
          <div className="text-[20px] font-bold text-[#0F766E]">{all ? fmtINR(total.value) : '…'}</div>
          <div className="text-[11px] text-gray-500">{total.checked} of {scoped.length} redirects checked{total.checked < scoped.length ? ' — the rest are not in this figure' : ''}</div>
        </div>
        <button onClick={checkAll} disabled={checkingAll || !scoped.length}
          className="ml-auto px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">
          {checkingAll ? 'Checking…' : `Check orders for ${scoped.length}`}
        </button>
        <select value={ec} onChange={(e) => setEc(e.target.value)} className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white">
          <option value="all">Every EC</option>
          {ecs.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <p className="basis-full text-[10.5px] text-gray-400">
          An order counts when its cart is owned by that EC&apos;s staff. The branch it was booked at needs a Django field that does not exist yet.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[12px] min-w-[900px]">
          <thead className="text-[10px] uppercase tracking-wider text-gray-400">
            <tr>
              {['Redirected', 'Client', 'From', 'EC', 'Purpose', 'Status', 'Assisted'].map((h) => <th key={h} className="text-left font-semibold px-3 py-2">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((v) => (
              <tr key={v.id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                  {fmtDay(String(v.createdAt || '').slice(0, 10))}
                  {v.visitDate && <div className="text-[10.5px] text-gray-400">visit {fmtDay(v.visitDate)}</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="font-semibold text-gray-900">{v.firm}</div>
                  <div className="text-[10.5px] text-gray-400 font-mono">{v.phones.join(', ')}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{v.sourceTeam ? B2B_TEAM_LABEL[v.sourceTeam] : '—'}<div className="text-[10.5px] text-gray-400">{v.scheduledBy}</div></td>
                <td className="px-3 py-2 whitespace-nowrap">{v.branch}{v.bmName && <div className="text-[10.5px] text-gray-400">{v.bmName}</div>}</td>
                <td className="px-3 py-2 max-w-[220px]">{v.purpose}{v.note && <div className="text-[10.5px] text-gray-400 break-words">{v.note}</div>}</td>
                <td className="px-3 py-2">
                  <select value={v.status} disabled={busy.has(v.id)} onChange={(e) => setStatus(v, e.target.value as EcVisitStatus)}
                    className="px-1.5 py-1 text-[11px] border border-gray-200 rounded-md bg-white">
                    {EC_VISIT_STATUSES.filter((s) => s !== 'Scheduled').map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {v.assisted ? (
                    <>
                      <div className={`font-semibold ${v.assisted.orders ? 'text-[#0F766E]' : 'text-gray-500'}`}>{fmtINR(v.assisted.value)} · {v.assisted.orders} order{v.assisted.orders === 1 ? '' : 's'}</div>
                      <div className="text-[10.5px] text-gray-400">checked {fmtDay(v.assisted.checkedAt.slice(0, 10))}</div>
                    </>
                  ) : <div className="text-gray-400">Not checked</div>}
                  <button onClick={() => check(v)} disabled={busy.has(v.id)} className="text-[10.5px] font-semibold text-[#0F766E] hover:underline disabled:opacity-50">
                    {busy.has(v.id) ? 'Checking…' : v.assisted ? 'Re-check' : 'Check orders'}
                  </button>
                  {rowError[v.id] && <div className="text-[10.5px] text-red-600 max-w-[200px] whitespace-normal">{rowError[v.id]}</div>}
                </td>
              </tr>
            ))}
            {all && !rows.length && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No redirects here yet. Use “Redirect to an EC” on a lead or a firm.</td></tr>
            )}
          </tbody>
        </table>
        {rows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-[11.5px] text-gray-500">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40">Prev</button>
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
