'use client';

import { useMemo, useState } from 'react';
import B2BOverview from './overview/index';
import InboundLeads from './inbound/index';
import OutreachLeads from './outreach/index';
import LeadsTab from './leads/index';
import ClientDatabase from './client-db/index';
import KAMs from './kams/index';
import EcDirected from './ec-directed/index';
import Leadership from './leadership/index';
import StudioSpace from './studio-space/index';
import TeamView from './team/index';
import Reminders from './reminders/index';
import { useB2BTeam } from '../hooks/use-b2b-team';
import { useReminders } from '../hooks/use-reminders';
import { useReminderAlerts } from '../hooks/use-reminder-alerts';
import { viewerFor } from '@/lib/b2b/team/utils';
import type { B2BTeam } from '@/lib/b2b/team/types';
import type { AppUser } from '@/types/crm';

type B2BView =
  | 'reminders' | 'overview' | 'leads' | 'inbound' | 'outreach' | 'clients' | 'kams' | 'ec'
  | 'leadership' | 'studio' | 'team';

const NAV: Array<{ key: B2BView; label: string; ready: boolean; teamManagersOnly?: boolean; managersOnly?: boolean }> = [
  { key: 'reminders',  label: 'Reminders',        ready: true },
  { key: 'overview',   label: 'Overview',         ready: true, managersOnly: true },
  { key: 'leads',      label: 'Leads',            ready: true, managersOnly: true },
  { key: 'inbound',    label: 'Inbound Leads',    ready: true },
  { key: 'outreach',   label: 'Outreach',         ready: true },

  { key: 'clients',    label: 'Client Database',  ready: true, managersOnly: true },
  { key: 'kams',       label: 'KAM',              ready: true },
  { key: 'ec',         label: 'EC Directed',      ready: true },
  { key: 'leadership', label: 'Leadership Board', ready: true },

  { key: 'studio',     label: 'Studio Space',     ready: true },
  { key: 'team',       label: 'Team',             ready: true, teamManagersOnly: true },
];

const TEAM_VIEW: Record<B2BTeam, B2BView> = { inbound: 'inbound', outreach: 'outreach', kam: 'kams' };

export default function B2BSalesCRM({ currentUser }: { currentUser: AppUser | null }) {
  const [picked, setView] = useState<B2BView | null>(null);
  const team = useB2BTeam();
  const viewer = useMemo(() => viewerFor(currentUser, team.members), [currentUser, team.members]);
  const reminders = useReminders(team, viewer);
  const alerts = useReminderAlerts(reminders.mine, reminders.nowMs, !reminders.loading && !team.loading, () => setView('reminders'));
  const nav = useMemo(() => NAV
    .filter((item) => (!item.teamManagersOnly || viewer.canManageTeam) && (!item.managersOnly || viewer.isManager))
    .map((item) => (item.key === 'leadership' && !viewer.isManager ? { ...item, label: 'My performance' } : item)), [viewer.isManager, viewer.canManageTeam]);
  const landing: B2BView = viewer.isManager ? 'overview' : viewer.member ? TEAM_VIEW[viewer.member.team] : 'leadership';
  const view = picked && nav.some((item) => item.key === picked) ? picked : landing;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-84px)] bg-[#FAFAFA]">

      <aside className="hidden md:flex w-52 shrink-0 bg-[#1A1A1A] flex-col py-3 overflow-y-auto">
        <div className="px-4 pb-3 mb-1 border-b border-gray-700">
          <div className="text-sm font-bold text-white">Material Depot</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">B2B Sales CRM</div>
        </div>
        <nav className="flex flex-col mt-2">
          {nav.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`text-left px-4 py-2.5 text-[13px] font-medium transition-colors flex items-center justify-between ${
                view === item.key
                  ? 'text-white border-l-2 border-[#EAB308] bg-white/5'
                  : 'text-gray-400 border-l-2 border-transparent hover:text-gray-200'
              }`}
            >
              <span>{item.label}</span>
              {item.key === 'reminders' && reminders.activeCount > 0 && <NavCount n={reminders.activeCount} />}
              {!item.ready && <span className="text-[8px] uppercase tracking-wider text-gray-600 font-bold">soon</span>}
            </button>
          ))}
        </nav>
      </aside>

      <div className="md:hidden shrink-0 bg-[#1A1A1A]">
        <nav className="flex overflow-x-auto no-scrollbar">
          {nav.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`shrink-0 px-4 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                view === item.key
                  ? 'text-white border-[#EAB308]'
                  : 'text-gray-400 border-transparent'
              }`}
            >
              {item.label}
              {item.key === 'reminders' && reminders.activeCount > 0 && <NavCount n={reminders.activeCount} className="ml-1.5" />}
              {!item.ready && <span className="ml-1.5 text-[8px] uppercase tracking-wider text-gray-600 font-bold">soon</span>}
            </button>
          ))}
        </nav>
      </div>

      <main className="flex-1 overflow-y-auto min-w-0">
        {team.loading && !viewer.isManager ? <p className="p-6 text-sm text-gray-400">Loading your B2B team…</p> : <>
        {view === 'reminders' && <Reminders reminders={reminders} team={team} viewer={viewer} alerts={alerts} />}
        {view === 'overview' && <B2BOverview team={team} onNavigate={setView} />}
        {view === 'inbound' && <InboundLeads team={team} viewer={viewer} />}
        {view === 'leads' && <LeadsTab team={team} viewer={viewer} />}
        {view === 'outreach' && <OutreachLeads team={team} viewer={viewer} />}
        {view === 'clients' && <ClientDatabase team={team} viewer={viewer} />}
        {view === 'kams' && <KAMs team={team} viewer={viewer} />}
        {view === 'ec' && <EcDirected viewer={viewer} />}
        {view === 'leadership' && <Leadership team={team} viewer={viewer} />}
        {view === 'studio' && <StudioSpace />}
        {view === 'team' && viewer.canManageTeam && <TeamView team={team} viewer={viewer} />}
        </>}
      </main>
    </div>
  );
}

function NavCount({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`min-w-[18px] h-[18px] px-1 rounded-full bg-[#EAB308] text-[#1A1A1A] text-[10px] font-bold inline-flex items-center justify-center ${className}`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}
