'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { PAGE_SIZE, SCORE_COLORS, SEARCH_TEXT_CAP, STATUS_LABEL } from '../constants';
import type { Dicts, DrillGroup, Remark, ScoreCtx, ScoreMode } from '../types';
import { DOW, dayOfWeek, dlabel } from '../utils/dates';
import { catList } from '../utils/filtering';
import { fmt, inr } from '../utils/format';
import { PointerRegexes, bits, leadKey } from '../utils/scoring';
import { EmptyState, FOCUS, Pager, PointerChips, Spinner } from '../ui';
import { LeadHistory } from './lead-history';
import { RemarkRow } from './remark-row';
import { drawerSummary, groupKey, groupRows, rowsForTab } from './utils';

export interface DrawerState { title: string; rows: Remark[]; tab: number; group: DrillGroup }

export function RemarksDrawer({ drill, dicts, ctx, mode, rx, ensureTexts, textOf, textVersion, onClose }: {
  drill: DrawerState;
  dicts: Dicts;
  ctx: ScoreCtx;
  mode: ScoreMode;
  rx: PointerRegexes;
  ensureTexts: (ids: number[], onProgress?: (done: number, total: number) => void) => Promise<void>;
  textOf: (id: number) => string | null | undefined;
  textVersion: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(drill.tab);
  const [group, setGroup] = useState<DrillGroup>(drill.group);
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [cart, setCart] = useState('');
  const [searching, setSearching] = useState('');
  const panel = useRef<HTMLElement>(null);

  useEffect(() => { setTab(drill.tab); setGroup(drill.group); setDraft(''); setQ(''); setPage(1); setCart(''); }, [drill]);
  useEffect(() => { const t = setTimeout(() => setQ(draft.trim().toLowerCase()), 350); return () => clearTimeout(t); }, [draft]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = overflow; prev?.focus?.(); };
  }, []);

  const summary = useMemo(() => drawerSummary(drill.rows, ctx, mode), [drill.rows, ctx, mode]);
  const tabRows = useMemo(() => rowsForTab(drill.rows, tab, summary.lm, ctx), [drill.rows, tab, summary.lm, ctx]);
  const searchPool = useMemo(() => (q ? tabRows.slice(0, SEARCH_TEXT_CAP) : tabRows), [tabRows, q]);

  useEffect(() => {
    if (!q) { setSearching(''); return; }
    let live = true;
    setSearching('Loading remark text…');
    ensureTexts(searchPool.map(r => r.id), (done, total) => { if (live) setSearching(`Loading remark text… ${Math.round((done * 100) / total)}%`); })
      .finally(() => { if (live) setSearching(''); });
    return () => { live = false; };
  }, [q, searchPool, ensureTexts]);

  const personName = (k: number) => dicts.person[k] || '';
  const rows = useMemo(() => {
    const name = (k: number) => dicts.person[k] || '';
    const matched = !q ? searchPool : searchPool.filter(r =>
      (textOf(r.id) || '').toLowerCase().includes(q) || r.lead.toLowerCase().includes(q) || name(r.author).toLowerCase().includes(q));
    return groupRows(matched, group, name);
  }, [searchPool, q, group, textOf, textVersion, dicts]);
  useEffect(() => { setPage(1); }, [tab, group, q]);

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageKey = pageRows.map(r => r.id).join(',');
  useEffect(() => { if (pageKey) ensureTexts(pageKey.split(',').map(Number)); }, [pageKey, ensureTexts]);

  const groupCount = useMemo(() => {
    const m = new Map<string | number, number>();
    if (group !== 'none') for (const r of rows) m.set(groupKey(r, group), (m.get(groupKey(r, group)) || 0) + 1);
    return m;
  }, [rows, group]);

  const groupHead = (r: Remark) => {
    const k = groupKey(r, group);
    const n = groupCount.get(k) || 0;
    const score = bits(summary.lm.get(leadKey(r)) ?? 0);
    return (
      <div key={`h-${k}`} className="sticky top-0 bg-white z-10 pt-3 pb-1.5 border-b-2 border-gray-900 font-bold flex gap-2.5 items-baseline flex-wrap">
        {group === 'lead' ? (
          <>
            <button onClick={() => r.lead && setCart(r.lead)} title="Full history of this cart" className={`font-mono text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-900 cursor-pointer ${FOCUS}`}>{r.lead || '(no cart id)'}</button>
            <span className="text-[11px] font-bold rounded px-1.5 text-white" style={{ background: SCORE_COLORS[score] }}
              title="Lead score: pointers covered by its remarks here">{score}/4</span>
            <PointerChips p={summary.lm.get(leadKey(r)) ?? 0} />
            <span className="font-normal text-[12px] text-gray-500">
              {STATUS_LABEL[dicts.status[r.status]] || ''}{r.value ? ` · ${inr(r.value)}` : ''} · {catList(dicts, r.cats).join(', ')}
            </span>
          </>
        ) : group === 'bm' ? (
          <>{personName(r.author) || '(unknown)'} <span className="font-normal text-[12px] text-gray-500">{dicts.branch[r.branch]}</span></>
        ) : (
          <>{dlabel(r.day)} <span className="font-normal text-[12px] text-gray-500">{DOW[dayOfWeek(r.day)]}</span></>
        )}
        <span className="ml-auto font-normal text-[12px] text-gray-500">{fmt(n)} remark{n === 1 ? '' : 's'}</span>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/35 z-[1000]" onClick={onClose} aria-hidden />
      <aside ref={panel} role="dialog" aria-modal="true" aria-labelledby="rq-drawer-title" tabIndex={-1}
        className="fixed top-0 right-0 bottom-0 w-full sm:max-w-[720px] bg-white z-[1000] flex flex-col shadow-2xl outline-none">
        <div className="px-4 sm:px-5 py-4 border-b border-gray-200 flex gap-2.5 items-start">
          <div className="min-w-0">
            <h3 id="rq-drawer-title" className="text-[15px] font-bold text-gray-900 break-words">{cart ? `Cart ${cart}` : drill.title}</h3>
            <div className="text-[12px] text-gray-500 tabular-nums">{cart ? 'Full history · all dates · every remark incl. system stamps' : summary.line}</div>
          </div>
          <button onClick={onClose} aria-label="Close" title="Close (Esc)"
            className={`ml-auto -mr-1 -mt-1 w-8 h-8 shrink-0 rounded-lg text-[22px] leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-900 cursor-pointer ${FOCUS}`}>×</button>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 sm:px-5 py-2.5 border-b border-gray-200 items-center">
          {cart ? (
            <button onClick={() => setCart('')} className={`max-w-full truncate border border-gray-200 rounded-full px-3 py-0.5 text-[12px] hover:bg-gray-50 cursor-pointer ${FOCUS}`}>← Back to {drill.title}</button>
          ) : (
            <>
              {summary.tabs.map(([t, label, n]) => (
                <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
                  className={`border rounded-full px-3 py-0.5 text-[12px] whitespace-nowrap tabular-nums cursor-pointer ${FOCUS} ${tab === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                  {label} · {fmt(n)}
                </button>
              ))}
              <select value={group} onChange={e => setGroup(e.target.value as DrillGroup)} aria-label="Group remarks" className="border border-gray-200 rounded-full px-2 py-0.5 text-[12px] bg-white">
                <option value="none">Latest first</option>
                <option value="bm">Group by BM</option>
                <option value="date">Group by date</option>
                <option value="lead">Group by Cart ID</option>
              </select>
              <input type="search" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Search text, lead, BM…" aria-label="Search remarks"
                className="flex-1 min-w-[160px] border border-gray-200 rounded-full px-3 py-1 text-[12px]" />
            </>
          )}
        </div>
        <div className="overflow-auto overscroll-contain flex-1 px-4 sm:px-5 pb-8">
          {cart ? <LeadHistory cart={cart} rx={rx} thresholds={ctx.thresholds} /> : (
            <>
              {searching && <div className="flex items-center gap-2 py-3 text-[12px] text-gray-500"><Spinner />{searching}</div>}
              {q && !searching && (
                <div className="pt-2.5 pb-0.5 text-[12px] text-gray-500">
                  {fmt(rows.length)} matching &quot;{draft.trim()}&quot;{tabRows.length > SEARCH_TEXT_CAP ? ` · searched the latest ${fmt(SEARCH_TEXT_CAP)} of ${fmt(tabRows.length)}` : ''}
                </div>
              )}
              {!rows.length && !searching && (
                <div className="pt-6"><EmptyState title={q ? 'No remarks match this search' : 'No remarks here'} sub={q ? 'Try another word, cart ID or BM name.' : 'Pick another tab above.'} /></div>
              )}
              {pageRows.map((r, i) => (
                <div key={r.id}>
                  {group !== 'none' && (i === 0 || groupKey(pageRows[i - 1], group) !== groupKey(r, group)) && groupHead(r)}
                  <RemarkRow r={r} dicts={dicts} ctx={ctx} text={textOf(r.id)} q={q} onLead={setCart} />
                </div>
              ))}
              <Pager page={page} total={rows.length} onPage={setPage} />
            </>
          )}
        </div>
      </aside>
    </>
  );
}
