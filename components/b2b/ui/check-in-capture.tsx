'use client';

import { useCallback, useEffect, useState } from 'react';
import { MeetingCheckIn, pinMapUrl } from '../models/outreach';

type Fix = { lat: number; lng: number; accuracy: number };

export function CheckInCapture({ title, by, onClose, onDone }: {
  title: string;
  by: string;
  onClose: () => void;
  onDone: (c: MeetingCheckIn) => Promise<string | null>;
}) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(() => {
    setLocError(null);
    if (!navigator.geolocation) { setLocError('This browser cannot share a location.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setFix({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy) }),
      (e) => setLocError(e.code === 1 ? 'Location permission was refused — allow it for this site and try again.' : 'Could not get a location fix. Try again near a window or outdoors.'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => { locate(); }, [locate]);

  const confirm = async () => {
    if (!fix || busy) return;
    setBusy(true);
    setError(null);
    try {
      const err = await onDone({ ...fix, at: new Date().toISOString(), by });
      if (err) setError(err); else onClose();
    } catch (e) {
      setError(`The check-in was not saved: ${e instanceof Error ? e.message : 'save failed'}. Try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-[460px] bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-[15px] font-bold text-gray-900">Check in · {title}</h2>
          <p className="text-[11.5px] text-gray-500">Take it on arrival, at the meeting place. Your exact location is stored with the meeting.</p>
        </div>

        <div className="px-5 py-3 flex flex-col gap-2 text-[12px]">
          <p className={fix ? 'text-[#0F766E]' : locError ? 'text-red-600' : 'text-gray-500'}>
            {fix ? `Location fixed · ${fix.lat}, ${fix.lng} · ±${fix.accuracy} m` : locError || 'Getting your location…'}
            {!fix && locError && <button onClick={locate} className="ml-2 underline">Try again</button>}
          </p>
          {error && <p className="text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-600">Cancel</button>
          <button onClick={confirm} disabled={!fix || busy}
            className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-40">
            {busy ? 'Saving…' : 'Check in'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CheckInLine({ c }: { c: MeetingCheckIn }) {
  const time = new Date(c.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return (
    <span className="inline-flex items-center gap-2 flex-wrap text-[11px]">
      <span className="text-[#0F766E] font-semibold">Checked in {c.at.slice(0, 10)} {time}</span>
      <a href={pinMapUrl(c)} target="_blank" rel="noreferrer" className="text-[#0F766E] hover:underline">{c.lat}, {c.lng}{c.accuracy ? ` · ±${c.accuracy} m` : ''}</a>
      <span className="text-gray-400">by {c.by}</span>
    </span>
  );
}
