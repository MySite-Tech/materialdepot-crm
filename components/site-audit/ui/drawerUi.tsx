'use client';

/* The primitives every Site Audit drawer is built out of — a titled section, a
   label/value row, and the slide-over shell itself.

   `Sec` and `KV` had been copy-pasted into the BM's audit drawer and the COE's
   wallpaper drawer independently, and the BM's new installation and
   custom-wallpaper drawers would have made four. One copy means a drawer opened
   from one tab can't drift into looking subtly different from the same drawer
   opened from another. `DrawerShell` is used by all three of the BM's drawers;
   the COE's own drawer keeps its bespoke header (it carries controls, not just a
   title) and only borrows Sec/KV. */

import type { ReactNode } from 'react';

export function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5 border-b border-gray-100 pb-4 last:border-b-0">
      <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">{title}</h3>
      {children}
    </div>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-3 py-0.5 text-[13px]">
      <span className="w-24 shrink-0 text-gray-400">{k}</span>
      <span className="min-w-0 text-gray-900">{v}</span>
    </div>
  );
}

/* Right-hand slide-over shell: the fixed backdrop, the panel, and the header
   with its close button — identical in every Site Audit drawer, including the
   click-outside-to-close behaviour that has to test `e.target === e.currentTarget`
   so a click that started inside the panel doesn't dismiss it. */
export function DrawerShell({ title, subtitle, badge, onClose, footer, children }: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[900] flex justify-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <div className="flex items-start gap-2 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            {subtitle ? <div className="mt-0.5 text-[12.5px] text-gray-400">{subtitle}</div> : null}
          </div>
          {badge ? <div className="ml-auto shrink-0">{badge}</div> : null}
          <button className={`h-7 w-7 shrink-0 rounded-md bg-gray-100 text-gray-500 ${badge ? '' : 'ml-auto'}`} onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer}
      </div>
    </div>
  );
}
