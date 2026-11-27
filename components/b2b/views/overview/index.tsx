'use client';

import { RevenueAnalysis } from './analysis';
import { OverviewSub, SUB_TABS } from './constants';
import { OverviewSummary } from './sections';
import { OverviewTarget } from './types';
import { PageHead } from './ui';
import type { B2BTeamLoad } from '@/lib/b2b/team/types';
import { ReactNode, useState } from 'react';

const SUBTITLES: Record<OverviewSub, string> = {
  summary: 'B2B revenue, pipeline and accounts at a glance',
  analysis: 'Slice revenue by channel, branch, rep, category and more, and compare any two months',
};

export default function B2BOverview({ team, onNavigate }: {
  team: B2BTeamLoad;
  onNavigate?: (t: OverviewTarget) => void;
}) {
  const [sub, setSub] = useState<OverviewSub>('summary');
  const head = (right: ReactNode) => (
    <PageHead title="Overview" subtitle={SUBTITLES[sub]} tabs={SUB_TABS} tab={sub} onTab={setSub} right={right} />
  );

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto flex flex-col gap-3">
      {sub === 'summary'
        ? <OverviewSummary team={team} onNavigate={onNavigate} onAnalyse={() => setSub('analysis')} head={head} />
        : <RevenueAnalysis head={head} />}
    </div>
  );
}
