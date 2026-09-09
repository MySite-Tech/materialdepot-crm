'use client';

import { computeAnalyticsMetrics } from './metrics';

import { NpsCard, PctCard, RatingCard, ArrCell, RatingCell, pc, pcBarClass, pcColorClass } from './cards';

import { AnalyticsAuditTable } from './audit-table';
import { AnalyticsFilters } from './filters';
import { AnalyticsFootnote } from './footnote';
import { AnalyticsInstallTable } from './install-table';

import { CatAnalyticsApi } from '../../data/catAnalytics';
import { JOB_STATUS, NPS_BAND_LABELS, NPS_HOUSE_NOTE, avgScore, npsFrom } from '../../siteAuditShared';
import { _anArrivalStats, _anAttachAuditRatings, _anAttachInstallRatings, _anAuditorMap, _anInstallAttempts, _anInstallerMap } from './aggregate';
import { BookExecSection } from './book-exec';
import { DrillModal } from './drill';
import { AnalyticsData, Drill, DrillRow } from '../../types/analytics';
import { _anAuditSigned, _anDateIST, _anDstr, _anInstallSigned, npsSummary } from '../../utils/analytics';
import { useMemo, useState } from 'react';

export function AnalyticsBody({
  data,
  chartApi,
  from,
  to,
  tempFrom,
  tempTo,
  setTempFrom,
  setTempTo,
  setAnalyticsFrom,
  setAnalyticsTo,
}: {
  data: AnalyticsData;
  chartApi: CatAnalyticsApi | null;
  from: string;
  to: string;
  tempFrom: string;
  tempTo: string;
  setTempFrom: (v: string) => void;
  setTempTo: (v: string) => void;
  setAnalyticsFrom: (v: string) => void;
  setAnalyticsTo: (v: string) => void;
}) {
  const M = useMemo(() => computeAnalyticsMetrics(data, from, to), [data, from, to]);


  const [drillKey, setDrillKey] = useState<string | null>(null);
  const openDrill = M.drills[drillKey || ''] || null;
  const tile = (key?: string) => {
    const d = key ? M.drills[key] : null;
    if (!d) return {};
    return {
      onClick: () => setDrillKey(key as string),
      role: 'button' as const,
      tabIndex: 0,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDrillKey(key as string);
        }
      },
      title: 'Show the ' + d.rows.length + ' row(s) behind this number',
      className: 'cursor-pointer transition hover:border-gray-400 hover:shadow-sm',
    };
  };

  const tileProps = (key: string | undefined, base: string) => {
    const t = tile(key) as any;
    return { ...t, className: base + (t.className ? ' ' + t.className : '') };
  };

  const iArrNote = M.iArrTot.onTime + M.iArrTot.late === 0 ? 'Tracking started 2 Jul 2026' : '';
  const aArrNote = M.aArrTot.onTime + M.aArrTot.late === 0 ? 'Tracking started 2 Jul 2026' : '';
  const statusDefs = [
    { k: 'completed', l: 'Completed', c: 'text-green-600' },
    { k: 'partial', l: 'Partially Completed', c: 'text-teal-600' },
    { k: 'onway', l: 'On The Way', c: 'text-blue-600' },
    { k: 'atsite', l: 'At Site', c: 'text-blue-600' },
    { k: 'reschedule', l: 'Rescheduled', c: 'text-red-600' },
    { k: 'callpending', l: 'Call Pending', c: 'text-amber-600' },
    { k: 'assigned', l: 'Assigned', c: 'text-amber-600' },
    { k: 'scheduled', l: 'Scheduled', c: 'text-gray-400' },
  ];

  function shortcut(days: number) {
    const t = new Date();
    const nt = _anDstr(t);
    t.setDate(t.getDate() - days);
    setAnalyticsFrom(_anDstr(t));
    setAnalyticsTo(nt);
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-gray-500 leading-relaxed">
        Operational metrics, straight off the ops database. Each scheduling attempt counted separately — a rescheduled order appears twice if both dates fall in
        the range. Not comparable with the commercial tabs, which count order lines in the order book rather than site visits.
        <br />
        <b>Click any tile</b> to see the orders behind the number — which ones met the criterion, which ones did not, and who they were assigned to.
      </p>

      {openDrill ? <DrillModal drill={openDrill} onClose={() => setDrillKey(null)} /> : null}

      <AnalyticsFilters
        setAnalyticsFrom={setAnalyticsFrom}
        setAnalyticsTo={setAnalyticsTo}
        setTempFrom={setTempFrom}
        setTempTo={setTempTo}
        shortcut={shortcut}
        tempFrom={tempFrom}
        tempTo={tempTo}
      />

      <AnalyticsAuditTable
        M={M}
        chartApi={chartApi}
        from={from}
        iArrNote={iArrNote}
        statusDefs={statusDefs}
        tileProps={tileProps}
        to={to}
      />

      <AnalyticsInstallTable
        tileProps={tileProps}
        M={M}
        aArrNote={aArrNote}
        chartApi={chartApi}
        from={from}
        to={to}
      />

      <AnalyticsFootnote

      />
    </div>
  );
}
