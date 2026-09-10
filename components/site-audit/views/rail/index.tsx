'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import SiteAuditRoleViewerView from '@/components/site-audit/views/role-viewer';
import SiteAuditJobsView from '@/components/site-audit/views/jobs';
import SiteAuditPerfView from '@/components/site-audit/views/perf';
import SiteAuditAnalyticsView from '@/components/site-audit/views/analytics';
import SiteAuditBmView from '@/components/site-audit/views/bm';
import SiteAuditUsersView from '@/components/site-audit/staff/users';
import { CITIES, loadCityFilter, saveCityFilter, type CityFilter } from '@/components/site-audit/shared';

const SiteAuditLiveView = dynamic(() => import('@/components/site-audit/views/live'), { ssr: false });

type View = 'users' | 'roleviewer' | 'jobs' | 'perf' | 'analytics' | 'live' | 'bm';

const TABS: Array<{ view: View; label: string }> = [
  { view: 'users', label: 'Users' },
  { view: 'roleviewer', label: 'Role Viewer' },
  { view: 'jobs', label: 'Job Overview' },
  { view: 'perf', label: 'Performance' },
  { view: 'analytics', label: 'Analytics' },
  { view: 'live', label: 'Live' },
  { view: 'bm', label: 'BM Orders' },
];

export default function SiteAuditRail({ user }: { user?: { name?: string; phone?: string; role?: string } | null }) {
  const [view, setView] = useState<View>('users');
  const [city, setCity] = useState<CityFilter>('all');
  useEffect(() => { setCity(loadCityFilter()); }, []);

  function pickCity(c: CityFilter) { setCity(c); saveCityFilter(c); }

  return (
    <div>
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 flex gap-0 items-center overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.view}
              onClick={() => setView(t.view)}
              className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent whitespace-nowrap ${
                view === t.view ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400" htmlFor="sa-city">City</label>
            <select
              id="sa-city"
              value={city}
              onChange={(e) => pickCity(e.target.value as CityFilter)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[140px] focus:border-[#0F766E]"
            >
              <option value="all">All Cities</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {view === 'users' && <SiteAuditUsersView actor={user || null} />}
        {view === 'roleviewer' && <SiteAuditRoleViewerView />}
        {view === 'jobs' && <SiteAuditJobsView city={city} />}
        {view === 'perf' && <SiteAuditPerfView city={city} />}
        {view === 'analytics' && <SiteAuditAnalyticsView city={city} />}
        {view === 'live' && <SiteAuditLiveView city={city} />}
        {view === 'bm' && <SiteAuditBmView me={user?.name ? { name: user.name, contact: user.phone, role: user.role } : null} />}
      </div>
    </div>
  );
}
