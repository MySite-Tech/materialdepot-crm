'use client';

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

          if (next.state === 'installed' && navigator.serviceWorker.controller) setWaiting(next);
        });
      });
    }).catch(() => { /* no service worker is a degraded PWA, not a broken app */ });

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
