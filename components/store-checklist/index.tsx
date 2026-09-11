'use client';

import { useMemo, useState } from 'react';
import { STORES } from '@/lib/store-display/display-supabase';
import { HISTORY_DAYS, OVERSIGHT_ROLES } from '@/lib/store-checklist/constants';
import { backdateDaysFor, canMarkDate, istToday, shiftDate, storesForUser } from '@/lib/store-checklist/utils';
import { ChecklistCompliance } from './compliance';
import { ChecklistMarker } from './marker';
import { Notice } from './ui/bits';
import { DatePicker, StorePicker } from './ui/store-picker';

type SubTab = 'day' | 'compliance';

export default function StoreChecklistTab({ role, allowedBranches }: {
  role: string;
  allowedBranches: string[];
}) {
  const today = istToday();
  const canOversee = OVERSIGHT_ROLES.has(role);

  const { codes, unmatched } = useMemo(() => storesForUser(role, allowedBranches), [role, allowedBranches]);
  const [subTab, setSubTab] = useState<SubTab>(canOversee ? 'compliance' : 'day');
  const [storeCode, setStoreCode] = useState<string | null>(codes.length === 1 ? codes[0] : null);
  const [date, setDate] = useState(today);

  const pickable = useMemo(() => (codes.length > 0 ? codes : STORES.map((s) => s.code)), [codes]);
  const markable = canMarkDate(role, date, today);
  const backdateDays = backdateDaysFor(role);

  const readOnlyReason = markable
    ? null
    : backdateDays === 0
      ? `View only — your account can mark today (${today}) only. Ask the store manager to fill an earlier day.`
      : `View only — your account can mark ${date > today ? 'past days' : `the last ${backdateDays + 1} days`} only.`;

  const openDay = (code: string, day: string) => {
    setStoreCode(code);
    setDate(day);
    setSubTab('day');
  };

  return (
    <div className="flex flex-col">
      {canOversee && (
        <div className="bg-white border-b border-gray-200">
          <div className="px-4 sm:px-6 flex gap-0">
            {([['day', 'Daily Checklist'], ['compliance', 'Compliance']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSubTab(key)}
                className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${
                  subTab === key ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {subTab === 'day' && (
        <>
          <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex flex-wrap items-end gap-3">
            <StorePicker codes={pickable} value={storeCode} onChange={setStoreCode} label="Store" />
            <DatePicker
              value={date}
              min={shiftDate(today, -Math.max(backdateDays, HISTORY_DAYS))}
              max={today}
              onChange={setDate}
              label="Date"
            />
            {date !== today && (
              <button
                type="button"
                onClick={() => setDate(today)}
                className="px-3 py-2 rounded-md border border-gray-200 bg-white text-[12.5px] font-semibold text-gray-600 cursor-pointer hover:border-gray-300"
              >
                Back to today
              </button>
            )}
          </div>

          {unmatched.length > 0 && (
            <div className="px-4 sm:px-6 pt-3">
              <Notice tone="amber">
                Your account lists {unmatched.join(', ')} as a branch, which is not one of the seven Experience Centres.
                Pick the store you are marking from the list — and ask an admin to fix the branch on your account under Admin &gt; Users.
              </Notice>
            </div>
          )}

          <ChecklistMarker
            storeCode={storeCode}
            date={date}
            readOnly={!markable}
            readOnlyReason={readOnlyReason}
          />
        </>
      )}

      {subTab === 'compliance' && canOversee && (
        <ChecklistCompliance storeCodes={pickable} onOpenDay={openDay} />
      )}
    </div>
  );
}
