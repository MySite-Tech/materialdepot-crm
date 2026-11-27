'use client';

import { useEffect, useMemo, useState } from 'react';
import { inCity, type CityFilter } from '../shared';
import { DATE_PRESETS, inDateRange, presetRange, type DatePresetKey } from '../coe-ops';
import { TD, TH } from '../audit-ops/constants';
import { fmtDate } from '../audit-ops/utils';
import { Empty, Head } from '../audit-ops/views/cells';
import { BAND_FILTERS, BAND_STYLE, NPS_COPY, NPS_DETRACTOR_MAX, NPS_PAGE_SIZE, NPS_PROMOTER_MIN } from './constants';
import { useNpsRows } from './rows/hooks/use-nps-rows';
import type { NpsBandFilter, NpsKind, NpsRow } from './types';
import { bandOf, matchesSearch, summarize } from './rows/utils';
import ScoreModal from './score';

function Tile({ value, label, tone, active, onClick }: { value: string; label: string; tone: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`rounded-lg border bg-white px-4 py-3 text-left ${active ? 'border-yellow-400' : 'border-gray-200'} ${onClick ? 'cursor-pointer hover:border-gray-300' : 'cursor-default'}`}>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
    </button>
  );
}

function ScoreCell({ value, r, showBand }: { value: number | null; r: NpsRow; showBand: boolean }) {
  if (value == null) return <span className="text-[12px] text-gray-400">Not scored yet</span>;
  const b = BAND_STYLE[bandOf(value)];
  return (
    <div>
      <b className={`text-[15px] ${b.text}`}>{value}</b>
      {showBand ? <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.pill}`}>{b.label}</span> : null}
      {r.jobs > 1 ? (
        <div className="text-[11px] text-gray-400">
          {r.scoredJobs === r.jobs ? `avg of ${r.jobs} jobs` : `${r.scoredJobs} of ${r.jobs} jobs scored`}
        </div>
      ) : null}
    </div>
  );
}

export default function NpsTabView({ kind, city, onOpenOrder, who, whoEmail }: {
  kind: NpsKind; city: CityFilter; onOpenOrder: (pi: string) => void; who: string; whoEmail?: string | null;
}) {
  const copy = NPS_COPY[kind];
  const { rows, failed, retry } = useNpsRows(kind);
  const [q, setQ] = useState('');
  const [preset, setPreset] = useState<DatePresetKey>('all');
  const [band, setBand] = useState<NpsBandFilter>('all');
  const [page, setPage] = useState(1);
  const [scoring, setScoring] = useState<NpsRow | null>(null);
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(null);

  const base = useMemo(() => {
    const range = presetRange(preset);
    return inCity(rows || [], city).filter((r) => inDateRange(r.date, range) && matchesSearch(r, q));
  }, [rows, city, preset, q]);
  const summary = useMemo(() => summarize(base), [base]);
  const list = useMemo(
    () => (band === 'all' ? base : band === 'unscored' ? base.filter((r) => !r.band) : base.filter((r) => r.band === band)),
    [base, band],
  );

  useEffect(() => { setPage(1); }, [city, preset, q, band]);

  const totalPages = Math.max(1, Math.ceil(list.length / NPS_PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = list.slice((curPage - 1) * NPS_PAGE_SIZE, curPage * NPS_PAGE_SIZE);
  const pick = (b: NpsBandFilter) => setBand((cur) => (cur === b ? 'all' : b));
  const bands = `Promoter ${NPS_PROMOTER_MIN}–10 · Neutral ${NPS_DETRACTOR_MAX + 1}–${NPS_PROMOTER_MIN - 1} · Detractor 0–${NPS_DETRACTOR_MAX}`;

  return (
    <>
      <Head
        title={copy.title}
        sub={`One row per ENQ, scored on Category Ops' day-after review call. NPS = (promoters − detractors) ÷ scored ENQs. ${bands}.`}
      />

      {failed ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700">
          <span>⚠ Couldn&apos;t load review scores. Nothing below is a real figure until this loads.</span>
          <button className="ml-auto rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-bold text-red-700" onClick={retry}>Retry</button>
        </div>
      ) : null}

      {notice ? (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-[13px] font-semibold ${notice.warn ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-700'}`}>
          <span>{notice.text}</span>
          <button className="ml-auto text-xs font-bold opacity-70" onClick={() => setNotice(null)}>✕</button>
        </div>
      ) : null}

      {scoring ? (
        <ScoreModal kind={kind} row={scoring} who={who} whoEmail={whoEmail} onClose={() => setScoring(null)}
          onSaved={(warn) => { setNotice({ text: warn || `Score saved for ${scoring.enq}.`, warn: !!warn }); setScoring(null); retry(); }} />
      ) : null}

      {rows ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile value={summary.nps == null ? '—' : String(summary.nps)} label={`NPS · ${summary.scored} scored`} tone="text-gray-900" active={band === 'all'} onClick={() => setBand('all')} />
            <Tile value={String(summary.prom)} label={`Promoters (${NPS_PROMOTER_MIN}–10)`} tone="text-green-700" active={band === 'promoter'} onClick={() => pick('promoter')} />
            <Tile value={String(summary.neu)} label={`Neutral (${NPS_DETRACTOR_MAX + 1}–${NPS_PROMOTER_MIN - 1})`} tone="text-amber-600" active={band === 'neutral'} onClick={() => pick('neutral')} />
            <Tile value={String(summary.det)} label={`Detractors (0–${NPS_DETRACTOR_MAX})`} tone="text-red-700" active={band === 'detractor'} onClick={() => pick('detractor')} />
            <Tile value={String(summary.unscored)} label="Not scored yet" tone="text-gray-500" active={band === 'unscored'} onClick={() => pick('unscored')} />
            <Tile value={summary.avgClean == null ? '—' : String(summary.avgClean)} label="Avg site cleanliness" tone="text-sky-700" />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ENQ, client, phone, ${copy.staff.toLowerCase()}…`}
                className="w-full max-w-xs rounded-md border border-gray-200 px-3 py-1.5 text-[13px] outline-none focus:border-yellow-400" />
              <select value={preset} onChange={(e) => setPreset(e.target.value as DatePresetKey)}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-[13px] outline-none focus:border-yellow-400">
                {DATE_PRESETS.map((p) => <option key={p.k} value={p.k}>{p.l}</option>)}
              </select>
              <div className="flex flex-wrap gap-1.5">
                {BAND_FILTERS.map((f) => (
                  <button key={f.k} onClick={() => setBand(f.k)}
                    className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${band === f.k ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                    {f.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>{['ENQ ID', 'Client', copy.date, copy.staff, `Overall ${copy.job} score`, 'Site cleanliness', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {pageRows.length ? pageRows.map((r) => (
                    <tr key={r.enq} onClick={() => onOpenOrder(r.enq)} className="cursor-pointer hover:bg-gray-50">
                      <td className={TD}><b className="font-mono text-xs">{r.enq}</b></td>
                      <td className={TD}><b>{r.name || '—'}</b><div className="text-gray-500">{r.phone}</div></td>
                      <td className={TD}>{fmtDate(r.date)}</td>
                      <td className={TD}>{r.staff.length ? r.staff.join(', ') : '—'}</td>
                      <td className={TD}><ScoreCell value={r.overall} r={r} showBand /></td>
                      <td className={TD}><ScoreCell value={r.clean} r={r} showBand={false} /></td>
                      <td className={TD}>
                        <button onClick={(e) => { e.stopPropagation(); setScoring(r); }}
                          className="whitespace-nowrap rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-gray-700 hover:border-gray-400">
                          + Add score
                        </button>
                      </td>
                    </tr>
                  )) : <Empty cols={7} msg={`No completed ${copy.job}s match these filters.`} />}
                </tbody>
              </table>
            </div>
            {list.length > NPS_PAGE_SIZE ? (
              <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2.5 text-[12px] text-gray-500">
                <span>Showing {(curPage - 1) * NPS_PAGE_SIZE + 1}–{Math.min(curPage * NPS_PAGE_SIZE, list.length)} of {list.length}</span>
                <div className="flex gap-2">
                  <button disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 disabled:cursor-default disabled:opacity-40">← Prev</button>
                  <button disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)} className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 disabled:cursor-default disabled:opacity-40">Next →</button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : !failed ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-[13px] text-gray-400">Loading review scores…</div>
      ) : null}
    </>
  );
}
