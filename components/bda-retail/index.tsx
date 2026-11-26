'use client';

import { useMemo, useState } from 'react';
import type { AppUser } from '@/types/crm';
import type { LeadView } from '@/lib/bda-retail/types';
import { BankLens, isMine, istToday, planPriorities, queueFor } from '@/lib/bda-retail/utils';
import { useBdaBank } from './hooks/use-bda-bank';
import { useBdaImport } from './hooks/use-bda-import';
import { Notice } from './ui/chips';
import { LeadDrawer } from './ui/lead-drawer';
import { BankFilters, BankView } from './views/bank';
import { OverviewView } from './views/overview';
import { PerformanceView } from './views/performance';
import { QueueView } from './views/queue';
import { TeamView } from './views/team';

type View = 'overview' | 'queue' | 'performance' | 'bank' | 'team';

const NAV: Array<{ key: View; label: string; adminOnly?: boolean }> = [
  { key: 'overview', label: 'Overview', adminOnly: true },
  { key: 'queue', label: 'My queue' },
  { key: 'performance', label: 'My performance' },
  { key: 'bank', label: 'Lead bank', adminOnly: true },
  { key: 'team', label: 'Team', adminOnly: true },
];

export default function BdaRetailTab({ currentUser }: { currentUser: AppUser }) {
  const { bank, access, admins, views, error, loading, reload, claim, release, call, plan } = useBdaBank();
  const importer = useBdaImport(reload);
  const [picked, setView] = useState<View | null>(null);
  const admin = access === 'admin';
  const nav = NAV.filter((item) => admin || !item.adminOnly);
  const view: View = picked && nav.some((item) => item.key === picked) ? picked : admin ? 'overview' : 'queue';
  const [openKey, setOpenKey] = useState<string | null>(null);
  const today = istToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [bankFilters, setBankFilters] = useState<BankFilters>({ lens: 'all', month: today.slice(0, 7) });

  const months = useMemo(() => [...new Set([today.slice(0, 7), ...views.map((l) => l.month)])].sort().reverse(), [views, today]);
  const planOf = (m: string) => planPriorities(m, bank?.plan ?? {});
  const todayActive = planOf(today.slice(0, 7));
  const dueCount = useMemo(() => queueFor(views, currentUser.phone, todayActive, today).due.length, [views, currentUser.phone, todayActive, today]);
  const open = openKey ? views.find((l) => l.key === openKey) ?? null : null;

  const browse = (l: LeadView) => setOpenKey(l.key);
  const take = (l: LeadView) => {
    setOpenKey(l.key);
    if (!l.claim && l.stage !== 'closed') void claim(l.key).catch(() => undefined);
  };

  const fetchButton = (
    <button
      onClick={() => void importer.run()}
      disabled={importer.running}
      title="Reads carts, orders and EC visits from Django and adds anyone new to the bank. Nothing is written to Django."
      className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50 self-end"
    >
      {importer.running ? importer.progress || 'Fetching…' : '↻ Fetch new leads'}
    </button>
  );

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-84px)] bg-[#FAFAFA]">
      <aside className="hidden md:flex w-52 shrink-0 bg-[#1A1A1A] flex-col py-3 overflow-y-auto">
        <div className="px-4 pb-3 mb-1 border-b border-gray-700">
          <div className="text-sm font-bold text-white">Material Depot</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">BDA Retail</div>
        </div>
        <nav className="flex flex-col mt-2">
          {nav.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`text-left px-4 py-2.5 text-[13px] font-medium transition-colors flex items-center justify-between ${
                view === item.key ? 'text-white border-l-2 border-[#EAB308] bg-white/5' : 'text-gray-400 border-l-2 border-transparent hover:text-gray-200'
              }`}
            >
              <span>{item.label}</span>
              {item.key === 'queue' && dueCount > 0 && <NavCount n={dueCount} />}
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
              className={`shrink-0 px-4 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${view === item.key ? 'text-white border-[#EAB308]' : 'text-gray-400 border-transparent'}`}
            >
              {item.label}
              {item.key === 'queue' && dueCount > 0 && <NavCount n={dueCount} className="ml-1.5" />}
            </button>
          ))}
        </nav>
      </div>

      <main className="flex-1 overflow-y-auto min-w-0">
        {(error || importer.error || importer.summary) && (
          <div className="px-4 sm:px-6 pt-4">
            {error && <Notice tone="red">{error}</Notice>}
            {importer.error && <Notice tone="red">{importer.error}</Notice>}
            {importer.summary && <Notice tone="teal">{importer.summary}</Notice>}
          </div>
        )}

        {view === 'overview' && admin && bank && (
          <OverviewView
            bank={bank}
            views={views}
            months={months}
            month={month}
            setMonth={setMonth}
            active={planOf(month)}
            planIsDefault={!bank.plan[month]}
            onPlan={(p) => plan(month, p)}
            today={today}
            onLens={(lens: BankLens) => { setBankFilters({ lens, month }); setView('bank'); }}
            fetchButton={fetchButton}
          />
        )}
        {view === 'queue' && bank && (
          <QueueView views={views} phone={currentUser.phone} active={todayActive} today={today} onOpen={take} />
        )}
        {view === 'bank' && admin && (
          <BankView
            views={views}
            loading={loading}
            months={months}
            filters={bankFilters}
            setFilters={setBankFilters}
            onOpen={browse}
            fetchButton={fetchButton}
          />
        )}
        {view === 'performance' && bank && (
          <PerformanceView views={views} phone={currentUser.phone} name={currentUser.name} today={today} />
        )}
        {view === 'team' && admin && <TeamView views={views} today={today} access={admins} />}
        {loading && !bank && view !== 'bank' && <p className="p-6 text-sm text-gray-400">Loading the lead bank…</p>}
      </main>

      {open && (
        <LeadDrawer
          lead={open}
          canCall={!open.claim || isMine(open, currentUser.phone)}
          onClose={() => setOpenKey(null)}
          onCall={(o, n, f) => call(open.key, o, n, f)}
          onRelease={admin ? () => release(open.key) : undefined}
        />
      )}
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
