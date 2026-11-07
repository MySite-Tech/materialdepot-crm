'use client';

import type { ClientEntity } from '../../../models/client';
import { AssignBar } from '../../../ui/assign-bar';
import { btnGhost, inputCls } from '../../../constants/ui';
import { PAGE_SIZE } from '../constants';
import { useReviewActions } from './hooks/use-review-actions';
import { useReviewQueue } from './hooks/use-review-queue';
import { ReviewTable } from './ui/table';
import { ReviewSort, matchesReview, sortReview } from './utils';
import { FIRM_KIND_LABEL } from '@/lib/b2b/client-import/constants';
import type { FirmKind } from '@/lib/b2b/client-import/types';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { useEffect, useMemo, useState } from 'react';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

const tab = (on: boolean) => `px-3 py-1.5 text-[12px] font-semibold ${on ? 'bg-[#0F766E] text-white' : 'bg-white text-gray-600'}`;

export function ClientReview({ clients, team, viewer, onClients }: {
  clients: ClientEntity[];
  team: B2BTeamLoad;
  viewer: Viewer;
  onClients: (added: ClientEntity[]) => void;
}) {
  const { queue, loading, error, load, settle, restore } = useReviewQueue();
  const [view, setView] = useState<'review' | 'rejected'>('review');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<FirmKind | 'all'>('all');
  const [sort, setSort] = useState<ReviewSort>('value');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const toReview = useMemo(() => queue?.firms ?? [], [queue]);
  const rejected = useMemo(() => queue?.rejected ?? [], [queue]);
  const act = useReviewActions({ list: toReview, clients, team, by: viewer.member?.name || viewer.name, onClients, settle, restore });

  const rows = useMemo(
    () => sortReview((view === 'review' ? toReview : rejected).filter((f) => matchesReview(f, kind, search)), sort),
    [view, toReview, rejected, kind, search, sort],
  );
  useEffect(() => { setPage(1); }, [view, kind, search, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE), [rows, curPage]);
  const reviewing = view === 'review';

  return (
    <div>
      <div className="mb-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-[12px] text-gray-600 flex items-start justify-between gap-3 flex-wrap">
        <p className="max-w-[760px] leading-relaxed">
          {queue ? (
            <>
              <b className="text-gray-800">{toReview.length.toLocaleString('en-IN')} firms</b> were billed with a GSTIN on orders placed
              {' '}{day(queue.from)} – {day(queue.to)} and are on no B2B board.
              {' '}{queue.onBoards.toLocaleString('en-IN')} more are already in the Client Database, Inbound or Outreach, so they are not listed.
              {' '}Send the real B2B firms on, and mark the rest Not a client so they stop coming back.
              {queue.truncated && <span className="font-semibold text-amber-800"> Some months had more orders than one read takes, so the list may be short.</span>}
            </>
          ) : 'Every firm billed with a GSTIN on an order in the last 12 months that no B2B board holds yet.'}
        </p>
        <span className="flex items-center gap-2 text-[11px] text-gray-400 shrink-0">
          {queue && `Orders read ${time(queue.checkedAt)}`}
          <button onClick={() => load(true)} disabled={loading} className={btnGhost}>{loading ? 'Reading orders…' : 'Refresh'}</button>
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-800">
          Firms could not be read from orders: {error}.{' '}
          <button onClick={() => load()} className="font-semibold underline cursor-pointer">Retry</button>
        </div>
      )}

      {queue && !queue.decisionsRead && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
          Firms marked Not a client could not be read, so any marked earlier are back in this list and Not a client cannot be saved.
          {' '}The B2B backend needs migration 0025 (client-review).
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
          <button onClick={() => setView('review')} className={tab(reviewing)}>To review{queue ? ` (${toReview.length})` : ''}</button>
          <button onClick={() => setView('rejected')} className={tab(!reviewing)}>Not a client{queue ? ` (${rejected.length})` : ''}</button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Firm, number or GSTIN"
          className={`${inputCls} !w-[220px]`} />
        <select value={kind} onChange={(e) => setKind(e.target.value as FirmKind | 'all')} className={`${inputCls} !w-auto`} aria-label="Type">
          <option value="all">Every type</option>
          {(Object.keys(FIRM_KIND_LABEL) as FirmKind[]).map((k) => <option key={k} value={k}>{FIRM_KIND_LABEL[k]}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as ReviewSort)} className={`${inputCls} !w-auto`} aria-label="Sort">
          <option value="value">Highest value first</option>
          <option value="orders">Most orders first</option>
          <option value="last">Latest order first</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {reviewing && (
          <>
            <AssignBar
              count={act.picked.size}
              noun="firm"
              teams={act.teams}
              busy={act.busy}
              rule="Inbound and Outreach each get a new lead, and an Outreach BM accepts or rejects it. KAM adds the firm to the Client Database, waiting for that KAM to accept. Round robin gives each to whichever of these people holds the fewest."
              total={rows.length}
              onPickAll={() => act.pickAll(rows.map((f) => f.key))}
              onAssign={act.assign}
              onClear={act.clear}
            />
            {act.picked.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-gray-100 text-[12px] text-gray-600">
                <span>Or, with no owner:</span>
                <button onClick={act.addToClientDb} disabled={act.busy} className={btnGhost}>Add to Client Database</button>
                <button onClick={act.notClient} disabled={act.busy} className={`${btnGhost} !text-red-700`}>Not a client</button>
              </div>
            )}
          </>
        )}
        {act.note && (
          <div className="px-4 py-2 text-[12px] text-teal-900 bg-teal-50 border-b border-teal-100 flex items-start justify-between gap-3">
            <span>{act.note}</span>
            <button onClick={() => act.setNote(null)} className="opacity-60 hover:opacity-100 leading-none">×</button>
          </div>
        )}
        {act.error && (
          <div className="px-4 py-2 text-[12px] text-red-700 bg-red-50 border-b border-red-100 flex items-start justify-between gap-3">
            <span>{act.error}</span>
            <button onClick={() => act.setError(null)} className="opacity-60 hover:opacity-100 leading-none">×</button>
          </div>
        )}

        {loading && !queue ? (
          <p className="text-sm text-gray-400 py-10 text-center">Reading 12 months of orders… this takes up to a minute the first time.</p>
        ) : rows.length ? (
          <ReviewTable
            rows={pageRows}
            picked={reviewing ? act.picked : undefined}
            onPick={act.toggle}
            onPickPage={() => act.togglePage(pageRows.map((f) => f.key))}
            open={open}
            onOpen={setOpen}
            onUndo={reviewing ? undefined : act.undo}
          />
        ) : queue ? (
          <p className="text-[13px] text-gray-500 py-10 text-center">
            {search.trim() || kind !== 'all'
              ? 'No firm here matches the search and type.'
              : reviewing ? 'Nothing left to review.' : 'No firm has been marked Not a client.'}
          </p>
        ) : null}

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
        Type comes from the GSTIN: its PAN&apos;s fourth letter says company, partnership or LLP, or an individual trading as a proprietor. Value is the cart value of every placed order in the window. Click a row for its latest orders and numbers.
      </p>
    </div>
  );
}
