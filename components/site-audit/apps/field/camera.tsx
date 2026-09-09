'use client';

import { ArrivalCameraModalProps } from '../../types/field-app';
import { readCapturedPhoto, uploadPhoto } from '@/components/site-audit/siteAuditShared';
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';

export function ArrivalCameraModal({ open, onClose, onConfirm }: ArrivalCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const camGenRef = useRef(0);

  const attemptRef = useRef(0);

  const [photo, setPhoto] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locStatus, setLocStatus] = useState({ text: 'Getting location…', color: '#9ca3af' });
  const [cameraFailed, setCameraFailed] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const confirmingRef = useRef(false);

  const camWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedLoc = useRef<{ lat: number; lng: number } | null>(null);

  const stopStream = useCallback(() => {
    camGenRef.current++;
    if (camWatchdogRef.current) { clearTimeout(camWatchdogRef.current); camWatchdogRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCamReady(false);
  }, []);

  const captureLocation = useCallback((opts?: PositionOptions) => {
    if (!navigator.geolocation) {
      setLocStatus({ text: 'Location not supported on this device', color: '#fbbf24' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude);
        setLng(p.coords.longitude);
        setLocStatus({
          text: `Location captured (${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)})`,
          color: '#4ade80',
        });
      },
      () => setLocStatus({ text: 'Location unavailable — photo still required', color: '#fbbf24' }),
      opts ?? { timeout: 10000, enableHighAccuracy: true },
    );
  }, []);

  const startCam = useCallback(() => {
    const gen = ++camGenRef.current;
    if (camWatchdogRef.current) clearTimeout(camWatchdogRef.current);

    camWatchdogRef.current = setTimeout(() => {
      if (gen !== camGenRef.current) return;
      if (!streamRef.current) { setCameraFailed(true); setCamReady(false); }
    }, 6000);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraFailed(true);
      setCamReady(false);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((s) => {
        if (gen !== camGenRef.current) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        setCameraFailed(false);
        setCamReady(true);
      })
      .catch(() => {
        if (gen !== camGenRef.current) return;
        setCameraFailed(true);
        setCamReady(false);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    setPhoto(null);
    setPhotoErr(null);
    setLat(null);
    setLng(null);
    setCameraFailed(false);
    setConfirming(false);
    attemptRef.current++;
    confirmingRef.current = false;
    resolvedLoc.current = null;
    setLocStatus({ text: 'Getting location…', color: '#9ca3af' });
    captureLocation();
    startCam();
    return () => {
      stopStream();
    };
  }, [open, captureLocation, startCam, stopStream]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !camReady || photo) return;
    if (vid.srcObject !== streamRef.current) vid.srcObject = streamRef.current;
  }, [camReady, photo, cameraFailed]);

  const doSnap = useCallback(() => {
    const vid = videoRef.current, cvs = canvasRef.current;
    if (!vid || !cvs) { fileInputRef.current?.click(); return; }
    const vw = vid.videoWidth || 640, vh = vid.videoHeight || 480;
    const W = Math.min(vw, 800), H = Math.round((vh * W) / vw);
    cvs.width = W;
    cvs.height = H;
    cvs.getContext('2d')!.drawImage(vid, 0, 0, W, H);
    const dataURL = cvs.toDataURL('image/jpeg', 0.6);
    stopStream();
    setPhoto(dataURL);
    if (lat === null) captureLocation({ timeout: 5000, enableHighAccuracy: true });
  }, [lat, stopStream, captureLocation]);

  const onFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      readCapturedPhoto(file, 800, 0.6).then((got) => {
        if (!got.ok) { setPhoto(null); setPhotoErr(got.error); return; }
        setPhotoErr(null);
        setPhoto(got.dataUrl);
      });
      if (lat === null) captureLocation({ timeout: 5000, enableHighAccuracy: true });
      e.target.value = '';
    },
    [lat, captureLocation],
  );

  const takePhoto = useCallback(() => {
    const vid = videoRef.current;
    const previewUsable = !!streamRef.current && !!vid && (vid.readyState >= 2 || vid.videoWidth > 0);
    if (previewUsable) doSnap();
    else fileInputRef.current?.click();
  }, [doSnap]);

  const retake = useCallback(() => {

    attemptRef.current++;
    confirmingRef.current = false;
    setPhoto(null);
    setPhotoErr(null);
    setCameraFailed(false);
    startCam();
  }, [startCam]);

  const handleClose = useCallback(() => {
    attemptRef.current++;
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  const handleConfirm = useCallback(async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    const attempt = attemptRef.current;
    setConfirming(true);

    if (lat === null) {
      await new Promise<void>((res) => {
        if (!navigator.geolocation) { res(); return; }
        navigator.geolocation.getCurrentPosition(
          (p) => { setLat(p.coords.latitude); setLng(p.coords.longitude); resolvedLoc.current = { lat: p.coords.latitude, lng: p.coords.longitude }; res(); },
          () => res(),
          { timeout: 4000, enableHighAccuracy: true },
        );
      });
    }
    let ph = photo;
    if (ph) {
      try {
        ph = await uploadPhoto(ph);
      } catch {

        ph = null;
      }
    }
    setConfirming(false);

    if (attempt !== attemptRef.current) { confirmingRef.current = false; return; }
    const fixed = resolvedLoc.current;
    handleClose();
    onConfirm({ photo: ph, lat: fixed ? fixed.lat : lat, lng: fixed ? fixed.lng : lng });
  }, [photo, lat, lng, handleClose, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black text-white">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {!photo && !cameraFailed && (
          <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full object-contain" />
        )}
        {!photo && cameraFailed && (
          <div className="flex flex-col items-center gap-3 p-6 text-center text-gray-300">
            <p className="text-sm">Can&apos;t show the camera in the app. Tap <b>Open Camera</b> below to use your phone&apos;s camera instead.</p>
          </div>
        )}
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Captured arrival" className="max-h-full max-w-full object-contain" />
        )}
        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
      <div className="p-3 text-center text-sm" style={{ color: locStatus.color }}>
        {locStatus.text}
      </div>
      {photoErr && (
        <div className="mx-4 mb-1 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900">
          {photoErr}
        </div>
      )}
      <div className="flex items-center justify-center gap-3 p-4 pb-6">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-xl border-2 border-gray-500 bg-transparent px-6 py-3 text-base font-extrabold text-white"
        >
          Cancel
        </button>
        {!photo && (

          <button
            type="button"
            onClick={takePhoto}
            className="rounded-xl bg-blue-600 px-6 py-3 text-base font-extrabold text-white"
          >
            {cameraFailed || !camReady ? 'Open Camera' : 'Take Photo'}
          </button>
        )}
        {!photo && photoErr && (

          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="rounded-xl bg-green-600 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-40"
          >
            {confirming ? 'Saving…' : 'Confirm without photo'}
          </button>
        )}
        {photo && (
          <>
            <button
              type="button"
              onClick={retake}
              className="rounded-xl border-2 border-gray-500 bg-transparent px-6 py-3 text-base font-extrabold text-white"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming}
              className="rounded-xl bg-green-600 px-6 py-3 text-base font-extrabold text-white disabled:opacity-40"
            >
              {confirming ? 'Uploading…' : 'Confirm'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
