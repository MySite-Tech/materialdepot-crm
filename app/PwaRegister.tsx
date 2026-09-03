'use client';

/* Registers the service worker and handles the update everybody forgets.

   Without a prompt, an installed tablet keeps serving whatever bundle it cached
   on the day it was installed: you fix a bug, deploy, and the store still runs
   last month's code with no way for anyone to tell. So a waiting worker is
   surfaced as a toast instead of taking over silently — silent takeovers swap
   the bundle mid-form, which is the other half of the same problem.

   Dev is skipped entirely: a cached shell over a Turbopack dev server is a
   debugging trap, and installability only matters in production anyway. */

import { useEffect, useState } from 'react';

export default function PwaRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (cancelled) return;
      if (reg.waiting) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          // `controller` is null on the very first install — that is a fresh
          // start, not an update, and prompting there would be nonsense.
          if (next.state === 'installed' && navigator.serviceWorker.controller) setWaiting(next);
        });
      });
    }).catch(() => { /* no service worker is a degraded PWA, not a broken app */ });

    // The new worker calls clients.claim(); reload once so every open tab lands
    // on the same bundle. Guarded because Chrome can fire this more than once.
    let reloaded = false;
    const onChange = () => { if (!reloaded) { reloaded = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
    };
  }, []);

  if (!waiting) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[2000] -translate-x-1/2 rounded-lg bg-[#1F3A5F] px-4 py-2.5 text-[13px] text-white shadow-xl">
      A new version of the CRM is ready.
      <button
        onClick={() => waiting.postMessage('skip-waiting')}
        className="ml-3 rounded-md bg-white px-2.5 py-1 text-[12px] font-bold text-[#1F3A5F]"
      >
        Reload
      </button>
    </div>
  );
}
