'use client';

export function AnalyticsFilters({ setAnalyticsFrom, setAnalyticsTo, setTempFrom, setTempTo, shortcut, tempFrom, tempTo }: {
  setAnalyticsFrom: (v: string) => void;
  setAnalyticsTo: (v: string) => void;
  setTempFrom: (v: string) => void;
  setTempTo: (v: string) => void;
  shortcut: (days: number) => void;
  tempFrom: string;
  tempTo: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-gray-500 font-semibold">Date range</span>
      <input
        type="date"
        className="border border-gray-200 rounded-md px-2.5 py-1.5 text-[13px]"
        value={tempFrom}
        onChange={(e) => setTempFrom(e.target.value)}
      />
      <span className="text-gray-400 text-[13px] px-0.5">to</span>
      <input
        type="date"
        className="border border-gray-200 rounded-md px-2.5 py-1.5 text-[13px]"
        value={tempTo}
        onChange={(e) => setTempTo(e.target.value)}
      />
      <button
        className="bg-[#EAB308] text-white border-none px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer hover:opacity-90"
        onClick={() => {
          setAnalyticsFrom(tempFrom);
          setAnalyticsTo(tempTo);
        }}
      >
        Apply
      </button>
      <button className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-semibold hover:border-gray-400" onClick={() => shortcut(6)}>
        Last 7 days
      </button>
      <button className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-semibold hover:border-gray-400" onClick={() => shortcut(29)}>
        Last 30 days
      </button>
      <button className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-semibold hover:border-gray-400" onClick={() => shortcut(89)}>
        Last 90 days
      </button>
    </div>
  );
}
