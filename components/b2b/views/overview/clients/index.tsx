'use client';

import { fmtL } from '../../../models/mock-data';
import { CHURN_GAP, FlowMonth } from '@/lib/b2b/revenue';
import { Fragment, ReactNode, useMemo, useState } from 'react';
import { Card, Notice } from '../ui';
import { Hint } from '../../../ui/info-tip';
import { FLOW_ROWS, GROUP_LABEL, SIDE_COLOR } from './constants';
import { useClientFlow } from './hooks/use-client-flow';
import type { FlowCell, FlowRowDef, Picked } from './types';
import { ClientList } from './ui/client-list';
import { CHURN_ROW, cell, listRows, shortMonth } from './utils';

const CHURN_DEF = {
  key: CHURN_ROW,
  label: 'Churned',
  hint: `Last order ${CHURN_GAP} months earlier and none since: no order in this month or the ${CHURN_GAP - 1} before it. In the current month, so far.`,
};

function Cell({ c, split, active, onPick }: { c: FlowCell; split: boolean; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!c.count}
      aria-pressed={active}
      className={`w-full text-right rounded-md px-2 py-1.5 cursor-pointer disabled:cursor-default ${active ? 'bg-gray-100 ring-1 ring-gray-300' : 'hover:bg-gray-50 disabled:hover:bg-transparent'}`}
    >
      <div className={`tabular-nums text-[14px] font-bold ${c.count ? 'text-gray-900' : 'text-gray-300'}`}>{c.count || '—'}</div>
      {!!c.count && <div className="tabular-nums text-[10px] text-gray-400">{fmtL(c.value)}</div>}
      {split && !!c.count && (
        <div className="tabular-nums text-[10px] mt-0.5">
          <span style={{ color: SIDE_COLOR.studio }}>{c.bySide.studio} Studio</span>
          <span className="text-gray-300"> · </span>
          <span style={{ color: SIDE_COLOR.ec }}>{c.bySide.ec} EC</span>
        </div>
      )}
    </button>
  );
}

function Row({ def, months, split, picked, onPick }: {
  def: Pick<FlowRowDef, 'key' | 'label' | 'hint'>;
  months: FlowMonth[];
  split: boolean;
  picked: Picked | null;
  onPick: (p: Picked) => void;
}) {
  return (
    <tr className="border-b border-gray-50">
      <td className="py-1 pr-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-700 whitespace-nowrap">{def.label}<Hint text={def.hint} /></span>
      </td>
      {months.map((m) => (
        <td key={m.key} className="py-1 px-1 align-top">
          <Cell
            c={cell(m, def.key)}
            split={split}
            active={picked?.row === def.key && picked.month === m.key}
            onPick={() => onPick({ row: def.key, month: m.key })}
          />
        </td>
      ))}
    </tr>
  );
}

export function ClientMovement({ head }: { head: (right: ReactNode) => ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { flow, error, loading, reload } = useClientFlow(refreshKey);
  const [picked, setPicked] = useState<Picked | null>(null);

  const months = flow?.months ?? [];
  const pickedMonth = months.find((m) => m.key === picked?.month);
  const list = useMemo(() => (pickedMonth && picked ? listRows(pickedMonth, picked.row) : []), [pickedMonth, picked]);
  const pickedLabel = picked && pickedMonth
    ? `${picked.row === CHURN_ROW ? CHURN_DEF.label : FLOW_ROWS.find((r) => r.key === picked.row)?.label} · ${pickedMonth.label}${pickedMonth.partial ? ' so far' : ''}`
    : '';
  const truncated = months.filter((m) => m.truncated);
  const pick = (p: Picked) => setPicked((cur) => (cur?.row === p.row && cur.month === p.month ? null : p));

  const refreshButton = (
    <button
      onClick={() => setRefreshKey((k) => k + 1)}
      disabled={loading}
      className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-lg bg-white text-gray-600 hover:border-gray-300 cursor-pointer disabled:opacity-50 disabled:cursor-default"
    >
      {loading ? 'Loading…' : 'Refresh'}
    </button>
  );

  return (
    <>
      {head(refreshButton)}

      {error && <Notice title="Clients could not be read.">{error}. Nothing below is a zero. <button onClick={reload} className="underline cursor-pointer">Retry</button></Notice>}
      {flow && !flow.studioOk && <Notice title="Studio Space numbers did not load.">Referred clients are missing, so some Studio clients may read as EC or not at all.</Notice>}
      {flow && !flow.redirectsOk && <Notice title="EC redirects did not load.">Some Studio EC Redirected clients may read as EC.</Notice>}
      {flow && !flow.historyOk && <Notice title="Some first-order dates did not load.">Clients without one read as Earlier client, gap unknown, never as New. Refresh to retry.</Notice>}
      {!!truncated.length && <Notice title={`${truncated.map((m) => m.label).join(', ')} has more orders than one read covers.`}>Its figures are incomplete.</Notice>}

      <Card>
        <div className="flex items-center gap-1.5 mb-1">
          <h2 className="text-[13px] font-bold text-gray-800">Clients month to month</h2>
        </div>
        <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
          A client is a firm across all its numbers (every Client Database, KAM, Studio Space or lead record that shares a number),
          otherwise one phone number. Studio means at least one order that month in Direct, Studio EC Redirected or Referred; EC means
          EC Direct orders only. Once a firm&rsquo;s B2B tie-up starts its store orders stay Studio, so Studio &rarr; EC stays empty;
          a firm with no order for three months is churned. Moves and churn look at every order with Material
          Depot on any branch from {flow ? shortMonth(flow.historyFrom.slice(0, 7)) : 'April 2026'}, which is as far back as Django&rsquo;s order
          read goes; New and Revived also use each number&rsquo;s first-ever order date.
        </p>

        {!flow ? (
          <p className="text-[12px] text-gray-400">{error ? 'Nothing to show until it loads.' : 'Reading every month of orders since April 2026. The first open can take a minute.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="w-[230px] py-2 pr-3 text-left text-[11px] font-semibold text-gray-400" />
                  {months.map((m) => (
                    <th key={m.key} className="py-2 px-2 text-right text-[12px] font-bold text-gray-700 whitespace-nowrap">
                      {shortMonth(m.key)}{m.partial ? <span className="font-normal text-gray-400"> so far</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['ordering', 'moved'] as const).map((group) => (
                  <Fragment key={group}>
                    <tr><td colSpan={months.length + 1} className="pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{GROUP_LABEL[group]}</td></tr>
                    {FLOW_ROWS.filter((r) => r.group === group).map((r) => (
                      <Row key={r.key} def={r} months={months} split={r.split} picked={picked} onPick={pick} />
                    ))}
                  </Fragment>
                ))}
                <tr><td colSpan={months.length + 1} className="pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Stopped ordering</td></tr>
                <Row def={CHURN_DEF} months={months} split picked={picked} onPick={pick} />
              </tbody>
            </table>
          </div>
        )}

        {picked && pickedMonth && <ClientList title={pickedLabel} rows={list} onClose={() => setPicked(null)} />}

        {flow && (
          <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
            Clients ordering = the three rows under it + the five rows below them. Revenue under each count is the client&rsquo;s B2B revenue that
            month in all four channels; under Churned it is their revenue in the month they last ordered. A churned client is counted as
            Studio or EC by that last month.
          </p>
        )}
      </Card>
    </>
  );
}
