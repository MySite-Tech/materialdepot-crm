'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendRemarkToLead } from '@/lib/api/crm/lead-details';
import {
  fetchAmBmDailyCard, fetchAmBmDay, fetchAmBms, saveAmBmDay,
  type AmBmDay, type AmBmList, type AmClosure, type AmSavePayload, type DailyCard,
} from '@/lib/api/crm/am-checklist';
import { istToday, shiftDate } from '@/lib/store-checklist/utils';
import type { AppUser } from '@/types/crm';
import { BmDailyCard } from './daily-card';
import { ClosuresCard, FollowupsCard, GroomingCard, OpensAtCutoffCard, PrioritiesCard } from './sections';
import { DaySummary } from './summary';

const HISTORY_DAYS = 60;

export default function AmChecklistTab({ currentUser }: { currentUser: AppUser }) {
  const today = istToday();
  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [list, setList] = useState<AmBmList | null>(null);
  const [bmId, setBmId] = useState<number | null>(null);
  const [day, setDay] = useState<AmBmDay | null>(null);
  const [card, setCard] = useState<DailyCard | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await fetchAmBms(date, branchId, signal);
      setList(data);
      setError('');
      setBmId((current) => {
        if (current && data.bms.some((b) => b.id === current)) return current;
        return (data.bms.find((b) => !b.progress.done) ?? data.bms[0])?.id ?? null;
      });
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message || 'Could not load your BMs');
    }
  }, [date, branchId]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadList(ctrl.signal);
    return () => ctrl.abort();
  }, [loadList]);

  useEffect(() => {
    if (!bmId) { setDay(null); setCard(null); return; }
    const ctrl = new AbortController();
    setDay(null);
    setCard(null);
    fetchAmBmDay(bmId, date, ctrl.signal).then(setDay).catch((e) => {
      if (e?.name !== 'AbortError') setError(e?.message || 'Could not load this BM');
    });
    if (date === today) {
      fetchAmBmDailyCard(bmId, ctrl.signal).then(setCard).catch(() => setCard(null));
    }
    return () => ctrl.abort();
  }, [bmId, date, today]);

  const save = useCallback(async (payload: AmSavePayload) => {
    if (!bmId) return;
    setSaving(true);
    try {
      setDay(await saveAmBmDay(bmId, date, payload));
      setError('');
      loadList();
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [bmId, date, loadList]);

  // The mock's promise: a not-placed reason "goes on the lead".
  const postReasonToLead = useCallback((closure: AmClosure, reason: string) => {
    if (!closure.deal_ticket_id) return;
    appendRemarkToLead(
      closure.deal_ticket_id,
      { ts: new Date().toISOString(), author: currentUser.name, text: `AM: not placed — ${reason}` },
      currentUser.phone,
    ).catch(() => { /* the reason is saved on the checklist either way */ });
  }, [currentUser.name, currentUser.phone]);

  const bms = list?.bms ?? [];
  const index = bms.findIndex((b) => b.id === bmId);
  const entry = index >= 0 ? bms[index] : null;
  const go = (step: number) => {
    if (!bms.length) return;
    setBmId(bms[(index + step + bms.length) % bms.length].id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const nextBm = () => {
    const after = [...bms.slice(index + 1), ...bms.slice(0, index)];
    const target = after.find((b) => !b.progress.done) ?? after[0];
    if (target) { setBmId(target.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };

  const branchName = useMemo(() => {
    if (!list) return '';
    if (branchId) return list.branches.find((b) => b.id === branchId)?.name ?? '';
    return list.branches.length === 1 ? list.branches[0].name : 'All branches';
  }, [list, branchId]);

  const downloadSummary = async () => {
    if (!summaryRef.current || !list) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const url = await toPng(summaryRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement('a');
      a.href = url;
      a.download = `am-summary-${branchName.replace(/\s+/g, '-').toLowerCase() || 'all'}-${list.date}.png`;
      a.click();
    } catch (e: any) {
      setError(e?.message || 'Could not create the image');
    } finally {
      setExporting(false);
    }
  };

  const locked = !!list?.locked;

  return (
    <div className="bg-[#F4F5F7] min-h-full pb-10">
      {/* ── header ── */}
      <div className="bg-[#1B2332] text-white sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-3 pb-3">
          <div className="text-[13px] font-semibold tracking-wide"><b className="text-[#F5C400]">MD</b> AM CHECKLIST</div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <select
              className="bg-[#262F40] text-white text-[14px] rounded-lg px-3 py-2 outline-none border-none min-w-[160px]"
              value={branchId ?? ''}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{list && list.branches.length === 1 ? list.branches[0].name : 'All branches'}</option>
              {(list?.branches ?? []).length > 1 && list!.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button type="button" className="bg-[#262F40] rounded-lg px-3 py-2 cursor-pointer border-none text-white" onClick={() => setDate(shiftDate(date, -1))}>‹</button>
            <input
              type="date"
              className="bg-[#262F40] text-white text-[14px] rounded-lg px-3 py-1.5 outline-none border-none [color-scheme:dark]"
              value={date}
              min={shiftDate(today, -HISTORY_DAYS)}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button type="button" disabled={date >= today} className="bg-[#262F40] rounded-lg px-3 py-2 cursor-pointer border-none text-white disabled:opacity-40" onClick={() => setDate(shiftDate(date, 1))}>›</button>
            <button
              type="button"
              disabled={!list || exporting}
              onClick={downloadSummary}
              className="ml-auto sm:ml-6 bg-[#F5C400] text-[#1B2332] font-bold text-[14px] rounded-lg px-4 py-2 border-none cursor-pointer disabled:opacity-60"
            >
              {exporting ? 'Making image…' : '⬇ WhatsApp summary (image)'}
            </button>
          </div>

          {/* BM chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto mt-3 pb-1">
            <span className="text-[12px] text-gray-400 whitespace-nowrap mr-1">{list ? `${list.done_count} of ${list.total} done` : '…'}</span>
            {bms.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBmId(b.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[14px] cursor-pointer border-2 ${b.id === bmId ? 'border-[#F5C400] bg-[#262F40]' : 'border-transparent bg-[#262F40]/70'} ${b.progress.done ? 'text-emerald-300' : 'text-white'}`}
              >
                {b.progress.done ? '✓ ' : ''}{b.first_name}
                {!b.progress.done && <span className="text-[11px] bg-[#3A4559] rounded-full px-1.5">{b.progress.todo}</span>}
              </button>
            ))}
          </div>

          {entry && (
            <div className="flex items-center gap-3 mt-3">
              <button type="button" onClick={() => go(-1)} className="bg-[#262F40] rounded-lg px-3 py-2 cursor-pointer border-none text-white">‹</button>
              <div className="flex-1 min-w-0">
                <div className="text-[24px] font-extrabold leading-tight truncate">{entry.name}</div>
                <div className="text-[13.5px] text-gray-300">
                  {index + 1} of {bms.length} · {entry.progress.done ? 'all done' : `${entry.progress.todo} to do`}
                  {currentUser.role !== 'assistant_manager' && entry.am ? ` · AM ${entry.am.name}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => go(1)} className="bg-[#262F40] rounded-lg px-3 py-2 cursor-pointer border-none text-white">›</button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-4">
        {error && <div className="mb-3 border border-red-200 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-[13px]">{error}</div>}
        {locked && <div className="mb-3 border border-gray-200 bg-white text-gray-600 rounded-lg px-3 py-2 text-[13px]">View only: days lock at midnight. Only today can be edited.</div>}
        {list && list.total === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center text-gray-500 text-[14px]">
            No BMs report to you yet. Ask an admin to set &ldquo;Reports to&rdquo; on each BM under Admin &gt; Users.
          </div>
        )}

        {entry && !day && <div className="p-10 text-center text-gray-400 text-[14px]">Loading {entry.first_name}…</div>}

        {day && entry && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
            <div className={`flex flex-col gap-4 ${saving ? 'opacity-90' : ''}`}>
              {day.cutoff.open ? (
                <>
                  <ClosuresCard day={day} locked={locked} save={save} onReasonSaved={postReasonToLead} />
                  <PrioritiesCard day={day} locked={locked} save={save} bmFirstName={entry.first_name} />
                  <FollowupsCard day={day} locked={locked} save={save} />
                  <GroomingCard day={day} locked={locked} save={save} />
                </>
              ) : (
                <>
                  <GroomingCard day={day} locked={locked} save={save} />
                  <PrioritiesCard day={day} locked={locked} save={save} bmFirstName={entry.first_name} />
                  <OpensAtCutoffCard label={day.cutoff.label} />
                </>
              )}
              <button type="button" onClick={nextBm} className="w-full py-4 rounded-2xl bg-[#1B2332] text-white text-[18px] font-semibold cursor-pointer border-none">
                Next BM ›
              </button>
              <p className="text-[12px] text-gray-400">
                Saves as you go{day.filled_by ? ` · last saved by ${day.filled_by.name}` : ''} · locks at midnight.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:sticky lg:top-[220px]">
              <h3 className="text-[17px] font-bold text-gray-900 mb-3">{entry.first_name}&apos;s daily card</h3>
              {date !== today ? (
                <p className="text-[13.5px] text-gray-500">The daily card shows today only.</p>
              ) : card ? (
                <BmDailyCard card={card} name={entry.name} />
              ) : (
                <p className="text-[13.5px] text-gray-400">Loading…</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Off-screen, captured by the WhatsApp button. */}
      {list && list.total > 0 && (
        <div aria-hidden className="fixed -left-[10000px] top-0 pointer-events-none">
          <DaySummary ref={summaryRef} list={list} branchName={branchName} />
        </div>
      )}
    </div>
  );
}
