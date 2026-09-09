'use client';

import { Dispatch, SetStateAction } from 'react';

export function KylasSyncModal({ handleKylasModalSync, kylasModalInput, kylasModalResult, setKylasModalInput, setKylasModalResult, setShowKylasModal }: {
  handleKylasModalSync: () => Promise<void>;
  kylasModalInput: string;
  kylasModalResult: { loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; link?: string | undefined; } | null;
  setKylasModalInput: Dispatch<SetStateAction<string>>;
  setKylasModalResult: Dispatch<SetStateAction<{ loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; link?: string | undefined; } | null>>;
  setShowKylasModal: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]" onClick={() => setShowKylasModal(false)}>
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">Kylas Sync</span>
          <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={() => setShowKylasModal(false)}>&times;</button>
        </div>
        <div className="p-5">
          <p className="text-[13px] text-gray-600 mb-2">Sync a deal to Kylas if it&apos;s missing. Enter a lead ID or cart number.</p>
          <input
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full focus:border-[#EAB308]"
            placeholder="e.g. ENQ2026043067368 or CT6F6100196349"
            value={kylasModalInput}
            autoFocus
            onChange={(e) => { setKylasModalInput(e.target.value); setKylasModalResult(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !kylasModalResult?.loading) handleKylasModalSync(); }}
          />
          {kylasModalResult?.msg && (
            <div className={`mt-3 text-[12px] ${kylasModalResult.ok ? 'text-green-600' : 'text-red-500'}`}>
              {kylasModalResult.msg}
              {kylasModalResult.link && (
                <a
                  href={kylasModalResult.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 font-semibold underline"
                >
                  View deal ↗
                </a>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={() => setShowKylasModal(false)}>Close</button>
          <button
            className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default"
            disabled={!kylasModalInput.trim() || kylasModalResult?.loading}
            onClick={handleKylasModalSync}
          >
            {kylasModalResult?.loading ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>
    </div>
  );
}
