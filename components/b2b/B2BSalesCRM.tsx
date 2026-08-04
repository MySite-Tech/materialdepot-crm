'use client';

import { useState } from 'react';
import B2BDashboard from './Dashboard';
import InboundLeads from './InboundLeads';
import OutboundLeads from './OutboundLeads';
import KAMs from './KAMs';
import LeadershipBoard from './LeadershipBoard';
import Targets from './Targets';

type B2BView = 'dashboard' | 'inbound' | 'outbound' | 'kams' | 'leadership' | 'targets';

const NAV: Array<{ key: B2BView; label: string; ready: boolean }> = [
  { key: 'dashboard',  label: 'Dashboard',        ready: true },
  { key: 'inbound',    label: 'Inbound Leads',    ready: true },
  { key: 'outbound',   label: 'Outbound Leads',   ready: true },
  { key: 'kams',       label: 'KAMs',             ready: true },
  { key: 'leadership', label: 'Leadership Board', ready: true },
  { key: 'targets',    label: 'Targets',          ready: true },
];

export default function B2BSalesCRM() {
  const [view, setView] = useState<B2BView>('dashboard');

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-84px)] bg-[#FAFAFA]">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex w-52 shrink-0 bg-[#1A1A1A] flex-col py-3 overflow-y-auto">
        <div className="px-4 pb-3 mb-1 border-b border-gray-700">
          <div className="text-sm font-bold text-white">Material Depot</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">B2B Sales CRM</div>
        </div>
        <nav className="flex flex-col mt-2">
          {NAV.map((item) => (
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
              {!item.ready && <span className="text-[8px] uppercase tracking-wider text-gray-600 font-bold">soon</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Top nav (mobile) ── */}
      <div className="md:hidden shrink-0 bg-[#1A1A1A]">
        <nav className="flex overflow-x-auto no-scrollbar">
          {NAV.map((item) => (
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
              {!item.ready && <span className="ml-1.5 text-[8px] uppercase tracking-wider text-gray-600 font-bold">soon</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {view === 'dashboard' && <B2BDashboard />}
        {view === 'inbound' && <InboundLeads />}
        {view === 'outbound' && <OutboundLeads />}
        {view === 'kams' && <KAMs />}
        {view === 'leadership' && <LeadershipBoard />}
        {view === 'targets' && <Targets />}
      </main>
    </div>
  );
}
