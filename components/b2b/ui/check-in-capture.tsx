'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MeetingCheckIn, pinMapUrl } from '../models/outreach';
import { uploadCheckInPhoto } from '@/lib/b2b';

const MAX_SIDE = 1280;

type Fix = { lat: number; lng: number; accuracy: number };

export function CheckInCapture({ title, refId, by, onClose, onDone }: {
  title: string;
  refId: string;
  by: string;
  onClose: () => void;
  onDone: (c: MeetingCheckIn) => Promise<string | null>;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [camError, setCamError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };

  useEffect(() => {
    if (photo) return undefined;
    let live = true;
    if (!navigator.mediaDevices?.getUserMedia) { setCamError('This browser cannot open the camera.'); return undefined; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((s) => {
        if (!live) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        setCamError(null);
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
      })
      .catch((e) => setCamError(e?.name === 'NotAllowedError' ? 'Camera permission was refused — allow it for this site and try again.' : 'The camera could not be opened.'));
    return () => { live = false; stop(); };
  }, [facing, photo]);

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

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    setPhoto(c.toDataURL('image/jpeg', 0.75));
    stop();
  };

  const confirm = async () => {
    if (!photo || !fix || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photoUrl = await uploadCheckInPhoto(photo, refId);
      const err = await onDone({ ...fix, at: new Date().toISOString(), photoUrl, by });
      if (err) setError(err); else onClose();
    } catch (e) {
      setError(`The photo was not stored: ${e instanceof Error ? e.message : 'upload failed'}. Nothing was checked in — try again.`);
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
          <p className="text-[11.5px] text-gray-500">Take it on arrival, at the meeting place. The photo and your exact location are stored with the meeting.</p>
        </div>

        <div className="bg-black aspect-[4/3] relative">
          {photo
            ? <img src={photo} alt="Check-in" className="w-full h-full object-contain" />
            : <video ref={video} playsInline muted className="w-full h-full object-cover" />}
          {camError && !photo && <p className="absolute inset-0 flex items-center justify-center text-center text-[12px] text-white px-6">{camError}</p>}
        </div>

        <div className="px-5 py-3 flex flex-col gap-2 text-[12px]">
          <div className="flex items-center gap-2 flex-wrap">
            {photo ? (
              <button onClick={() => setPhoto(null)} disabled={busy} className="px-3 py-1.5 rounded-md border border-gray-200 text-gray-700">Retake</button>
            ) : (
              <>
                <button onClick={snap} disabled={!!camError} className="px-3 py-1.5 rounded-md bg-[#1A1A1A] text-white font-semibold disabled:opacity-40">Take photo</button>
                <button onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} className="px-3 py-1.5 rounded-md border border-gray-200 text-gray-600">Switch camera</button>
              </>
            )}
          </div>
          <p className={fix ? 'text-[#0F766E]' : locError ? 'text-red-600' : 'text-gray-500'}>
            {fix ? `Location fixed · ${fix.lat}, ${fix.lng} · ±${fix.accuracy} m` : locError || 'Getting your location…'}
            {!fix && locError && <button onClick={locate} className="ml-2 underline">Try again</button>}
          </p>
          {error && <p className="text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-600">Cancel</button>
          <button onClick={confirm} disabled={!photo || !fix || busy}
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
      <a href={c.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
        <img src={c.photoUrl} alt="Check-in" className="w-9 h-9 rounded object-cover border border-gray-200" />
      </a>
      <span className="text-[#0F766E] font-semibold">Checked in {c.at.slice(0, 10)} {time}</span>
      <a href={pinMapUrl(c)} target="_blank" rel="noreferrer" className="text-[#0F766E] hover:underline">{c.lat}, {c.lng}{c.accuracy ? ` · ±${c.accuracy} m` : ''}</a>
      <span className="text-gray-400">by {c.by}</span>
    </span>
  );
}
