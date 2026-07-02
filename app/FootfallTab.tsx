'use client';

import { useState } from 'react';
import FootfallDashboard from './FootfallDashboard';
import FootfallRepeatDashboard from './FootfallRepeatDashboard';
import FootfallBreakdownDashboard from './FootfallBreakdownDashboard';

interface Props {
  branches: string[];
  allowedBranches: string[];
}

type View = 'funnel' | 'repeat' | 'breakdown';

const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'funnel', label: 'Funnel' },
  { key: 'repeat', label: 'Repeat Footfall' },
  { key: 'breakdown', label: 'Footfall Breakdown' },
];

export default function FootfallTab({ branches, allowedBranches }: Props) {
  const [view, setView] = useState<View>('funnel');
  return (
    <div>
      <div className="px-3 sm:px-6 pt-4 flex items-center gap-2">
        {VIEWS.map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
              view === v.key
                ? 'bg-[#EAB308] text-black border-[#EAB308] shadow-sm'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === 'funnel' && <FootfallDashboard branches={branches} allowedBranches={allowedBranches} />}
      {view === 'repeat' && <FootfallRepeatDashboard branches={branches} allowedBranches={allowedBranches} />}
      {view === 'breakdown' && <FootfallBreakdownDashboard branches={branches} allowedBranches={allowedBranches} />}
    </div>
  );
}
