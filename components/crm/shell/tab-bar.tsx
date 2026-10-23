'use client';

import { TAB_LABELS } from '../constants';
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
      {(Object.entries(TAB_LABELS) as Array<[MainTab, string]>)
        .filter(([key]) => key === 'appointmentTracker' ? canSeeAppointmentTracker : allowedTabs.includes(key))
        .map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            className={`px-3 sm:px-4 py-2 text-[12px] font-semibold border-b-2 cursor-pointer bg-transparent transition-colors whitespace-nowrap ${effectiveTab === key ? 'border-[#EAB308] text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            {label}
          </button>
        ))}
    </div>
  );
}
