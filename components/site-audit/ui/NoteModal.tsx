'use client';

/* Required-note prompt, as an in-page modal instead of window.prompt().
   window.prompt() is unreliable exactly where this app runs — installed
   PWAs and mobile webviews commonly no-op or auto-return null for
   prompt/confirm/alert, and desktop Chrome permanently silences it for an
   origin once "Prevent this page from creating additional dialogs" gets
   checked — so a required note could vanish with no error and no visible
   dialog at all. This is the drop-in replacement for the old
   requireNote() calls: same "does nothing until a non-blank note is
   given" contract, but rendered as real DOM the app fully controls. */

import { useCallback, useRef, useState } from 'react';

type NoteReq = { label: string; preface?: string; resolve: (v: string | null) => void };

export function useNoteModal() {
  const [req, setReq] = useState<NoteReq | null>(null);
  const [val, setVal] = useState('');
  const reqRef = useRef<NoteReq | null>(null);

  const ask = useCallback((label: string, preface?: string) => {
    return new Promise<string | null>((resolve) => {
      const r: NoteReq = { label, preface, resolve };
      reqRef.current = r;
      setVal('');
      setReq(r);
    });
  }, []);

  const finish = (v: string | null) => {
    const r = reqRef.current;
    reqRef.current = null;
    setReq(null);
    if (r) r.resolve(v);
  };

  const modal = req ? (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-4" onClick={(e) => { if (e.target === e.currentTarget) finish(null); }}>
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-2xl">
        {req.preface ? <div className="mb-2 text-[12.5px] text-gray-500">{req.preface}</div> : null}
        <div className="mb-1 text-[13px] font-bold text-gray-900">Add a note for this action (required)</div>
        <div className="mb-2.5 text-[12.5px] text-gray-500">{req.label}</div>
        <textarea
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && val.trim()) finish(val.trim()); }}
          placeholder="Type a note…"
          className="block min-h-[80px] w-full resize-y rounded-lg border border-gray-200 p-2.5 text-[13.5px] outline-none focus:border-yellow-400"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => finish(null)} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700">Cancel</button>
          <button
            type="button"
            onClick={() => { const note = val.trim(); if (note) finish(note); }}
            className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Save note
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { ask, modal };
}
