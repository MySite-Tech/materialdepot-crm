'use client';

import { INSTALL_STATUS } from './constants';
import { useEffect, useState } from 'react';

export function StatusPill({ status }: { status: string }) {
  const s = INSTALL_STATUS[status] || { label: status, badge: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${s.badge}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{s.label}</span>;
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" />;
}

export function CommentSheet({ open, title, onCancel, onConfirm }: { open: boolean; title: string; onCancel: () => void; onConfirm: (comment: string) => void }) {
  const [value, setValue] = useState('');
  useEffect(() => { if (open) setValue(''); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-3 text-base font-bold text-[#1F3A5F]">{title}</div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a comment (optional — leave blank to skip)"
          className="mb-3 min-h-[90px] w-full resize-y rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-yellow-400"
        />
        <div className="grid grid-cols-3 gap-2.5">
          <button onClick={onCancel} className="rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onConfirm(value.trim())} className="col-span-2 rounded-xl bg-[#1F3A5F] py-3 text-sm font-semibold text-white hover:opacity-90">Confirm</button>
        </div>
      </div>
    </div>
  );
}
