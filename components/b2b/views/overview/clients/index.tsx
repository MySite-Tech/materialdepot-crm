'use client';

import { fmtL } from '../../../models/mock-data';
import { CHURN_GAP, FlowMonth } from '@/lib/b2b/revenue';
import type { ReviewFirm } from '@/lib/b2b/client-import/types';
import { Fragment, ReactNode, useMemo, useState } from 'react';
import { Card, Notice } from '../ui';
import { Hint } from '../../../ui/info-tip';
import { FLOW_ROWS, GROUP_LABEL, SIDE_COLOR } from './constants';
import { useClientFlow } from './hooks/use-client-flow';
import { useUnregistered } from './hooks/use-unregistered';
import type { FlowRowDef, ListRow, Picked } from './types';
import { Cell } from './ui/cell';
import { ClientList } from './ui/client-list';
import { CHURN_ROW, UNREGISTERED_ROW, cell, churnSpendMonth, listRows, shortMonth, unregisteredCell, unregisteredRows } from './utils';

const CHURN_DEF = {
  key: CHURN_ROW,
  label: 'Churned',
  hint: `Last order ${CHURN_GAP} months earlier and none since: no order in this month or the ${CHURN_GAP - 1} before it. In the current month, so far. The amount under the count is what they spent in that last month, the monthly spend lost, not revenue in this month.`,
};

const UNREGISTERED_DEF = {
  key: UNREGISTERED_ROW,
  label: 'Not registered yet',
  hint: 'Firms billed with a GSTIN on an order that month that are on no B2B board (no Client Database, KAM, Inbound or Outreach record on any of their numbers or GSTINs), not marked Not a client, and not already counted above. Their orders are outside Clients ordering and All B2B. Proprietors are individual GSTINs and include store walk-ins asking for a GST bill. Work them in Client Database, Review new firms: a firm sent on leaves this row, and its orders join All B2B, past months included.',
};

const SIDE_SPLIT = (studio: number, ec: number) => (
  <>
    <span style={{ color: SIDE_COLOR.studio }}>{studio} Studio</span>
    <span className="text-gray-300"> · </span>
    <span style={{ color: SIDE_COLOR.ec }}>{ec} EC</span>
  </>
);

function Label({ def }: { def: Pick<FlowRowDef, 'label' | 'hint'> }) {
  return (
    <td className="py-1 pr-3">
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-700 whitespace-nowrap">{def.label}<Hint text={def.hint} /></span>
    </td>
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
      <Label def={def} />
      {months.map((m) => {
        const c = cell(m, def.key);
        return (
          <td key={m.key} className="py-1 px-1 align-top">
            <Cell
              count={c.count}
              value={def.key === CHURN_ROW ? `${fmtL(c.value)} spent in ${churnSpendMonth(m.key)}` : fmtL(c.value)}
              sub={(split || c.gapUnknown > 0) && (
                <>
                  {split && SIDE_SPLIT(c.bySide.studio, c.bySide.ec)}
                  {c.gapUnknown > 0 && <div className="text-gray-400">incl. {c.gapUnknown} gap unknown</div>}
                </>
              )}
              active={picked?.row === def.key && picked.month === m.key}
              onPick={() => onPick({ row: def.key, month: m.key })}
            />
          </td>
        );
      })}
    </tr>
  );
}

function UnregisteredRow({ months, firms, failed, picked, onPick }: {
  months: FlowMonth[];
  firms: ReviewFirm[] | null;
  failed: boolean;
  picked: Picked | null;
  onPick: (p: Picked) => void;
}) {
  return (
    <tr className="border-b border-gray-50">
      <Label def={UNREGISTERED_DEF} />
      {months.map((m) => {
        const c = firms ? unregisteredCell(m, firms) : null;
        return (
          <td key={m.key} className="py-1 px-1 align-top">
            {c ? (
              <Cell
                count={c.count}
                value={fmtL(c.value)}
                sub={<span className="text-gray-500">{c.business} {c.business === 1 ? 'firm' : 'firms'} · {c.proprietor} {c.proprietor === 1 ? 'proprietor' : 'proprietors'}</span>}
                active={picked?.row === UNREGISTERED_ROW && picked.month === m.key}
                onPick={() => onPick({ row: UNREGISTERED_ROW, month: m.key })}
              />
            ) : (
              <div className="text-right px-2 py-1.5 tabular-nums text-[14px] font-bold text-gray-300">{failed ? 'Unknown' : '…'}</div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

const LIST_LABELS = {
  [CHURN_ROW]: { value: 'Spent in their last month' },
  [UNREGISTERED_ROW]: { now: 'GSTIN type', before: 'First order · main store', value: 'Ordered this month' },
} as const;

export function ClientMovement({ head }: { head: (right: ReactNode) => ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { flow, error, loading, reload } = useClientFlow(refreshKey);
  const unregistered = useUnregistered(refreshKey);
  const [picked, setPicked] = useState<Picked | null>(null);

  const months = flow?.months ?? [];
  const pickedMonth = months.find((m) => m.key === picked?.month);
  const list = useMemo((): ListRow[] => {
    if (!pickedMonth || !picked) return [];
    if (picked.row === UNREGISTERED_ROW) return unregistered.firms ? unregisteredRows(pickedMonth, unregistered.firms) : [];
    return listRows(pickedMonth, picked.row);
  }, [pickedMonth, picked, unregistered.firms]);
  const rowLabel = (row: string) =>
    row === CHURN_ROW ? CHURN_DEF.label : row === UNREGISTERED_ROW ? UNREGISTERED_DEF.label : FLOW_ROWS.find((r) => r.key === row)?.label;
  const pickedLabel = picked && pickedMonth ? `${rowLabel(picked.row)} · ${pickedMonth.label}${pickedMonth.partial ? ' so far' : ''}` : '';
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
      {flow && !flow.historyOk && <Notice title="Some first-order dates did not load.">Clients without one count as Revived, gap unknown, never as New. Refresh to retry.</Notice>}
      {unregistered.error && <Notice title="Firms found on orders could not be read.">{unregistered.error}. Not registered yet reads Unknown; everything else is unaffected.</Notice>}
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
                <tr><td colSpan={months.length + 1} className="pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Outside the B2B book</td></tr>
                <UnregisteredRow months={months} firms={unregistered.firms} failed={!!unregistered.error} picked={picked} onPick={pick} />
              </tbody>
            </table>
          </div>
        )}

        {picked && pickedMonth && (
          <ClientList title={pickedLabel} rows={list} labels={LIST_LABELS[picked.row as keyof typeof LIST_LABELS]} onClose={() => setPicked(null)} />
        )}

        {flow && (
          <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
            Clients ordering = the two rows under it + the five rows below them. Revenue under each count is the client&rsquo;s B2B revenue that
            month in all four channels. Under Churned it is what they spent in the month they last ordered, not revenue this month, and a
            churned client is counted as Studio or EC by that month. Not registered yet is outside both: firms ordering at stores with a
            GSTIN that no B2B record holds yet.
          </p>
        )}
      </Card>
    </>
  );
}
