'use client';

import { Search } from 'lucide-react';
import { ClientEntity, STUDIO_SPACE_URL, clientMatchesSearch, clientStatus, contactNumbers, currentTemperature, daysToLapse, firmStudioState, istToday } from '../../models/client';
import { FirmDrawer } from '../../drawers/firm';
import { useClientAggregates } from '../../hooks/use-client-aggregates';
import { TemperatureChip } from '../../ui/client-chips';
import { LensTileGroup, LensTiles } from '../../ui/lens-tiles';
import { PAGE_SIZE, STUDIO_LENS } from './constants';
import { StudioLens, StudioRow } from './types';
import { kamOnboarding, rowsByLens } from './utils';
import { KamOnboardingTable } from './ui/kam-onboarding';
import { StudioTable } from './ui/table';
import { btnGhost } from '../../constants/ui';
import { fetchClients, upsertClient } from '@/lib/b2b';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function StudioSpace() {
  const [clients, setClients] = useState<ClientEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [kam, setKam] = useState('all');
  const [lens, setLens] = useState<StudioLens>('all');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const today = istToday();
  const { addPhones, metricsFor, historyFor } = useClientAggregates();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setClients(await fetchClients());
    } catch (e) {
      console.error('[b2b] studio space load failed', e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const searched = useMemo<StudioRow[]>(
    () => clients.filter((c) => clientMatchesSearch(c, search)).map((client) => ({ client, studio: firmStudioState(client) })),
    [clients, search],
  );
  const scoped = useMemo(() => searched.filter((r) => kam === 'all' || (kam === '' ? !r.client.kam : r.client.kam === kam)), [searched, kam]);
  const byLens = useMemo(() => rowsByLens(scoped), [scoped]);
  const perKam = useMemo(() => kamOnboarding(searched), [searched]);
  const kamOptions = useMemo(() => [...new Set(clients.map((c) => c.kam).filter((k): k is string => !!k))].sort(), [clients]);

  useEffect(() => { setPage(1); }, [search, kam, lens]);

  const rows = byLens[lens];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const numbersUnclassified = scoped.reduce((n, r) => n + r.studio.unclassified, 0);
  const numbers = (n: number) => `${n} number${n === 1 ? '' : 's'}`;
  const tileSub = (k: StudioLens): string => {
    const n = byLens[k].length;
    const share = scoped.length ? `${Math.round((n / scoped.length) * 100)}% of firms` : '';
    switch (k) {
      case 'all':          return numbers(scoped.reduce((s, r) => s + r.studio.numbers, 0));
      case 'onboarded':    return `${numbers(scoped.reduce((s, r) => s + r.studio.onboarded, 0))} · ${share}`;
      case 'none':         return share;
      case 'nopower':      return n ? 'Orders + Rewards only' : 'all have one';
      case 'unclassified': return numbers(numbersUnclassified);
    }
  };
  const tile = (k: StudioLens) => ({
    key: k, title: STUDIO_LENS[k].title, rule: STUDIO_LENS[k].rule, accent: STUDIO_LENS[k].accent,
    value: loading ? '…' : loadError ? 'Unknown' : String(byLens[k].length),
    sub: loading ? 'loading' : loadError ? 'did not load' : tileSub(k),
    warn: !!loadError || ((k === 'nopower' || k === 'unclassified') && byLens[k].length > 0),
    muted: !loading && !loadError && k !== 'all' && byLens[k].length === 0,
  });
  const tileGroups: LensTileGroup<StudioLens>[] = [
    { title: 'Firms on Studio Space', tiles: (['all', 'onboarded', 'none'] as StudioLens[]).map(tile) },
    { title: 'Needs attention', tiles: (['nopower', 'unclassified'] as StudioLens[]).map(tile) },
  ];

  const open = (c: ClientEntity) => { setOpenId(c.id); addPhones(contactNumbers(c.contacts)); };
  const openRow = useMemo(() => {
    const client = clients.find((c) => c.id === openId);
    if (!client) return null;
    const metrics = metricsFor(client);
    return { client, metrics, status: clientStatus(metrics, today), days: daysToLapse(metrics, today), temp: currentTemperature(client.interactions) };
  }, [clients, openId, metricsFor, today]);

  const saveClient = async (c: ClientEntity): Promise<string | null> => {
    const err = await upsertClient(c);
    if (err) return err;
    setClients((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    addPhones(contactNumbers(c.contacts));
    return null;
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Studio Space</h1>
          <p className="text-xs text-gray-400 mt-0.5 max-w-[620px]">
            Which numbers at each firm are on the Studio Space dashboard, and with what access. Mark a number from the
            firm&apos;s page: Power user sees the whole dashboard, Non-power user only Orders and Rewards.
          </p>
        </div>
        <a
          href={STUDIO_SPACE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F766E] text-white text-[13px] font-semibold hover:bg-[#0D5F58]"
        >
          Open Studio Space ↗
        </a>
      </div>

      {loadError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-800">
          Could not load the Client Database: {loadError}.{' '}
          <button onClick={load} className="font-semibold underline cursor-pointer">Retry</button>
        </div>
      )}

      <LensTiles groups={tileGroups} active={lens} onPick={setLens} />

      <KamOnboardingTable rows={loading || loadError ? [] : perKam} onPickKam={(k) => { setKam(k); setLens('all'); }} />

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative w-full sm:w-[300px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search firm, contact, number or GSTIN"
            className={`w-full pl-7 pr-2 py-1.5 text-[12px] border rounded-md bg-white outline-none focus:border-[#0F766E] ${search ? 'border-[#0F766E]' : 'border-gray-200'}`}
          />
        </div>
        <select value={kam} onChange={(e) => setKam(e.target.value)}
          className={`pl-2.5 pr-7 py-1.5 text-[12px] rounded-md border cursor-pointer outline-none ${kam !== 'all' ? 'border-[#0F766E] bg-teal-50 text-[#0F766E] font-semibold' : 'border-gray-200 bg-white text-gray-700'}`}>
          <option value="all">Every KAM</option>
          <option value="">No KAM</option>
          {kamOptions.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        {(search || kam !== 'all') && <button onClick={() => { setSearch(''); setKam('all'); }} className={btnGhost}>Clear</button>}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 text-[12px] font-semibold text-gray-700" title={STUDIO_LENS[lens].rule}>
          {STUDIO_LENS[lens].title}
          <span className="ml-2 font-normal text-gray-400">{STUDIO_LENS[lens].rule}</span>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading firms…</p>
        ) : rows.length ? (
          <StudioTable rows={pageRows} onOpen={open} />
        ) : (
          <p className="text-[13px] font-semibold text-gray-600 py-10 text-center">{STUDIO_LENS[lens].empty}</p>
        )}
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-500 flex-wrap">
            <span>Showing {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, rows.length)} of {rows.length}</span>
            {rows.length > PAGE_SIZE && (
              <div className="flex gap-2">
                <button disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">← Prev</button>
                <button disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">Next →</button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-400 mt-3">
        This is the CRM&apos;s record of who was onboarded. It is not read from Studio Space and does not change anyone&apos;s access there.
      </p>

      {openRow && (
        <FirmDrawer
          client={openRow.client}
          clients={clients}
          metrics={openRow.metrics}
          status={openRow.status}
          days={openRow.days}
          historyFor={historyFor}
          badges={openRow.temp && <TemperatureChip value={openRow.temp.value} at={openRow.temp.at} />}
          reassignReason="Reassigned from the Studio Space tab"
          onClose={() => setOpenId(null)}
          onSave={saveClient}
        />
      )}
    </div>
  );
}
