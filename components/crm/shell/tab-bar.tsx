'use client';

import { MainTab } from '../types';
import { Dispatch, SetStateAction } from 'react';

export function CrmTabBar({ allowedTabs, canSeeAppointmentTracker, effectiveTab, setMainTab }: {
  allowedTabs: MainTab[];
  canSeeAppointmentTracker: boolean;
  effectiveTab: MainTab;
  setMainTab: Dispatch<SetStateAction<MainTab>>;
}) {
  return (
    <div className="bg-[#1A1A1A] border-t border-gray-700 px-2 sm:px-6 flex overflow-x-auto [&::-webkit-scrollbar]:hidden">
      {([{ key: 'leads' as const, label: 'Leads' }, { key: 'dashboard' as const, label: 'Dashboard' }, { key: 'footfall' as const, label: 'Footfall' }, { key: 'weeklyFunnel' as const, label: 'Weekly Funnel' }, { key: 'reportCard' as const, label: 'Report Card' }, { key: 'storeVisit' as const, label: 'Store Visit Form' }, { key: 'storeChecklist' as const, label: 'Store Checklist' }, { key: 'sales' as const, label: 'Escalation visibility' }, { key: 'b2bSales' as const, label: 'B2B Sales' }, { key: 'admin' as const, label: 'Admin' }, { key: 'nps' as const, label: 'NPS' }, { key: 'siteAudit' as const, label: 'Site Audit' }, { key: 'appointmentTracker' as const, label: 'Appointment Tracker' }, { key: 'storeDisplay' as const, label: 'Store Display' }])
        .filter(t => t.key === 'appointmentTracker'
          ? canSeeAppointmentTracker
          : allowedTabs.includes(t.key))
        .map(t => (
          <button
            key={t.key}
            onClick={() => {
              if (t.key === 'sales') {
                setMainTab('sales');
                return;
              }
              setMainTab(t.key);
            }}
            className={`px-3 sm:px-4 py-2 text-[12px] font-semibold border-b-2 cursor-pointer bg-transparent transition-colors whitespace-nowrap ${effectiveTab === t.key ? 'border-[#EAB308] text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            {t.label}
          </button>
        ))}
    </div>
  );
}
