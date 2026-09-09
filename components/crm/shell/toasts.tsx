'use client';

export function CrmToasts({ csvImportCount, handleLogout, saveErrorMsg, toast, setToast }: {
  setToast: (v: null) => void;
  csvImportCount: number | null;
  handleLogout: () => void;
  saveErrorMsg: string | null;
  toast: { msg: string; ok: boolean; link?: string | undefined; } | null;
}) {
  return (
    <>
          {csvImportCount != null && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white px-6 py-2.5 rounded-lg text-[13px] font-semibold z-[1100] shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
        Successfully imported {csvImportCount} lead{csvImportCount !== 1 ? 's' : ''}
      </div>
    )}
    {saveErrorMsg && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-5 py-3 rounded-lg text-[13px] font-semibold z-[1100] shadow-[0_4px_12px_rgba(0,0,0,0.2)] flex items-center gap-4">
        <span>⚠ {saveErrorMsg}</span>
        <button
          onClick={handleLogout}
          className="bg-white text-red-600 px-3 py-1 rounded text-[12px] font-bold cursor-pointer border-none shrink-0"
        >
          Log out
        </button>
      </div>
    )}
    {toast && (
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-lg text-[13px] font-semibold z-[1100] shadow-[0_4px_12px_rgba(0,0,0,0.2)] flex items-center gap-4 text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
        <span>{toast.ok ? '✓' : '⚠'} {toast.msg}</span>
        {toast.link && (
          <a
            href={toast.link}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-green-700 px-3 py-1 rounded text-[12px] font-bold cursor-pointer no-underline shrink-0"
          >
            View deal ↗
          </a>
        )}
        <button
          onClick={() => setToast(null)}
          className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[12px] font-bold cursor-pointer border-0 shrink-0"
        >
          ✕
        </button>
      </div>
    )}
    </>
  );
}
