'use client';

import { Dispatch, SetStateAction } from 'react';

export function CsvErrorsModal({ csvErrors, setCsvErrors }: {
  csvErrors: string[];
  setCsvErrors: Dispatch<SetStateAction<string[] | null>>;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[540px]">
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">CSV Validation Errors</span>
          <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={() => setCsvErrors(null)}>&times;</button>
        </div>
        <div className="p-5 max-h-[400px] overflow-y-auto">
          <p className="text-[13px] mb-3 text-red-500 font-semibold">
            {csvErrors.length} error{csvErrors.length !== 1 ? 's' : ''} found. No leads were imported.
          </p>
          <ul className="m-0 pl-5 text-xs leading-[1.8] text-gray-700">
            {csvErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 text-right">
          <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={() => setCsvErrors(null)}>Close</button>
        </div>
      </div>
    </div>
  );
}
