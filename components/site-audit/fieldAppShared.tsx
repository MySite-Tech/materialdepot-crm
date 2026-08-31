'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { sbGet, sbPatch, uploadPhoto } from '@/components/site-audit/siteAuditShared';

export type SketchPoint = { x: number; y: number };
export type SketchStroke = SketchPoint[];

function cloneStrokes(strokes: SketchStroke[]): SketchStroke[] {
  return strokes.map((s) => s.map((p) => ({ x: p.x, y: p.y })));
}

export interface SketchCanvasHandle {
  undo(): void;
  clear(): void;
  export(): string;
}

export interface SketchCanvasProps {
  value?: SketchStroke[];
  onChange?: (strokes: SketchStroke[]) => void;
  className?: string;
}

const SKETCH_DOT_SPACING = 22;
const SKETCH_STROKE_COLOR = '#1F3A5F';
const SKETCH_LINE_WIDTH = 2.2;
const SKETCH_EXPORT_WIDTH = 1000;
const SKETCH_EXPORT_LINE_WIDTH = 3.2;
const SKETCH_EXPORT_QUALITY = 0.85;

export const SketchCanvas = forwardRef<SketchCanvasHandle, SketchCanvasProps>(function SketchCanvas(
  { value, onChange, className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<SketchStroke[]>(value ? cloneStrokes(value) : []);
  const dimsRef = useRef({ w: 0, h: 0 });
  const curRef = useRef<SketchStroke | null>(null);
  const drawingRef = useRef(false);
  const renderRef = useRef<() => void>(() => {});
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function render() {
      const { w, h } = dimsRef.current;
      if (!w) return;
      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = '#fff';
      ctx!.fillRect(0, 0, w, h);
      const s = SKETCH_DOT_SPACING;
      ctx!.fillStyle = '#b2b8c1';
      for (let yy = s; yy < h; yy += s) {
        for (let xx = s; xx < w; xx += s) {
          ctx!.beginPath();
          ctx!.arc(xx, yy, 1.3, 0, 7);
          ctx!.fill();
        }
      }
      ctx!.strokeStyle = SKETCH_STROKE_COLOR;
      ctx!.lineWidth = SKETCH_LINE_WIDTH;
      ctx!.lineJoin = 'round';
      ctx!.lineCap = 'round';
      for (const st of strokesRef.current) {
        if (st.length < 1) continue;
        ctx!.beginPath();
        st.forEach((p, i) => {
          const X = p.x * w, Y = p.y * h;
          if (i) ctx!.lineTo(X, Y); else ctx!.moveTo(X, Y);
        });
        ctx!.stroke();
      }
    }
    renderRef.current = render;

    function fit() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      if (!rect.width) return;
      dimsRef.current = { w: rect.width, h: rect.height };
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    }

    function pos(e: PointerEvent): SketchPoint {
      const r = canvas!.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    }
    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      drawingRef.current = true;
      curRef.current = [pos(e)];
      strokesRef.current.push(curRef.current);
    }
    function onPointerMove(e: PointerEvent) {
      if (!drawingRef.current || !curRef.current) return;
      e.preventDefault();
      curRef.current.push(pos(e));
      render();
    }
    function onPointerUp() {
      const was = drawingRef.current;
      drawingRef.current = false;
      curRef.current = null;
      if (was) onChangeRef.current?.(strokesRef.current);
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(canvas);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    strokesRef.current = value ? cloneStrokes(value) : [];
    renderRef.current();
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      undo() {
        strokesRef.current.pop();
        renderRef.current();
      },
      clear() {
        strokesRef.current = [];
        renderRef.current();
      },
      export() {
        const { w, h } = dimsRef.current;
        const W = SKETCH_EXPORT_WIDTH;
        const H = Math.round(W * ((h / w) || 0.5));
        const o = document.createElement('canvas');
        o.width = W;
        o.height = H;
        const x = o.getContext('2d')!;
        x.fillStyle = '#fff';
        x.fillRect(0, 0, W, H);
        const s = Math.round(SKETCH_DOT_SPACING * (W / (w || 300)));
        x.fillStyle = '#b2b8c1';
        for (let yy = s; yy < H; yy += s) {
          for (let xx = s; xx < W; xx += s) {
            x.beginPath();
            x.arc(xx, yy, 2, 0, 7);
            x.fill();
          }
        }
        x.strokeStyle = SKETCH_STROKE_COLOR;
        x.lineWidth = SKETCH_EXPORT_LINE_WIDTH;
        x.lineJoin = 'round';
        x.lineCap = 'round';
        for (const st of strokesRef.current) {
          if (st.length < 1) continue;
          x.beginPath();
          st.forEach((p, i) => {
            const X = p.x * W, Y = p.y * H;
            if (i) x.lineTo(X, Y); else x.moveTo(X, Y);
          });
          x.stroke();
        }
        return o.toDataURL('image/jpeg', SKETCH_EXPORT_QUALITY);
      },
    }),
    [],
  );

  return (
    <canvas
      ref={canvasRef}
      className={cn('aspect-[4/3] w-full touch-none rounded-lg border border-gray-200 bg-white', className)}
    />
  );
});

export interface SignaturePadHandle {
  clear(): void;
  isEmpty(): boolean;
  export(): string;
}

export interface SignaturePadProps {
  className?: string;
}

const SIGN_STROKE_COLOR = '#13294a';
const SIGN_LINE_WIDTH = 2.4;
const SIGN_EXPORT_WIDTH = 900;
const SIGN_EXPORT_LINE_WIDTH = 3;
const SIGN_EXPORT_QUALITY = 0.9;
const SIGN_EXPORT_RATIO_FALLBACK = 0.3;

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<SketchStroke[]>([]);
  const dimsRef = useRef({ w: 0, h: 0 });
  const curRef = useRef<SketchStroke | null>(null);
  const drawingRef = useRef(false);
  const renderRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function render() {
      const { w, h } = dimsRef.current;
      if (!w) return;
      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = '#fff';
      ctx!.fillRect(0, 0, w, h);
      ctx!.strokeStyle = SIGN_STROKE_COLOR;
      ctx!.lineWidth = SIGN_LINE_WIDTH;
      ctx!.lineJoin = 'round';
      ctx!.lineCap = 'round';
      for (const st of strokesRef.current) {
        if (st.length < 1) continue;
        ctx!.beginPath();
        st.forEach((p, i) => {
          const X = p.x * w, Y = p.y * h;
          if (i) ctx!.lineTo(X, Y); else ctx!.moveTo(X, Y);
        });
        ctx!.stroke();
      }
    }
    renderRef.current = render;

    function fit() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      if (!rect.width) return;
      dimsRef.current = { w: rect.width, h: rect.height };
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    }

    function pos(e: PointerEvent): SketchPoint {
      const r = canvas!.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    }
    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      drawingRef.current = true;
      curRef.current = [pos(e)];
      strokesRef.current.push(curRef.current);
    }
    function onPointerMove(e: PointerEvent) {
      if (!drawingRef.current || !curRef.current) return;
      e.preventDefault();
      curRef.current.push(pos(e));
      render();
    }
    function onPointerUp() {
      drawingRef.current = false;
      curRef.current = null;
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(canvas);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      clear() {
        strokesRef.current = [];
        renderRef.current();
      },
      isEmpty() {
        return strokesRef.current.length === 0;
      },
      export() {
        const { w, h } = dimsRef.current;
        const W = SIGN_EXPORT_WIDTH;
        const H = Math.round(W * ((h / w) || SIGN_EXPORT_RATIO_FALLBACK));
        const o = document.createElement('canvas');
        o.width = W;
        o.height = H;
        const x = o.getContext('2d')!;
        x.fillStyle = '#fff';
        x.fillRect(0, 0, W, H);
        x.strokeStyle = SIGN_STROKE_COLOR;
        x.lineWidth = SIGN_EXPORT_LINE_WIDTH;
        x.lineJoin = 'round';
        x.lineCap = 'round';
        for (const st of strokesRef.current) {
          if (st.length < 1) continue;
          x.beginPath();
          st.forEach((p, i) => {
            const X = p.x * W, Y = p.y * H;
            if (i) x.lineTo(X, Y); else x.moveTo(X, Y);
          });
          x.stroke();
        }
        return o.toDataURL('image/jpeg', SIGN_EXPORT_QUALITY);
      },
    }),
    [],
  );

  return (
    <canvas
      ref={canvasRef}
      className={cn('aspect-[3/1] w-full touch-none rounded-lg border border-gray-200 bg-white', className)}
    />
  );
});

export interface LocationTracker {
  start(orderPi: string | null): void;
  stop(): void;
}

const LOCATION_PATCH_INTERVAL_MS = 300000;
const LOCATION_WATCH_MIN_GAP_MS = 300000;
const LOCATION_INTERVAL_MIN_GAP_MS = 299000;

export function useLocationTracking(email: string): LocationTracker {
  const watchIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef(0);
  const activePiRef = useRef<string | null>(null);
  const emailRef = useRef(email);
  emailRef.current = email;

  const patchMyLoc = useCallback(async (lat: number | null, lng: number | null, pi: string | null) => {
    try {
      const rows = await sbGet('profiles?email=eq.' + encodeURIComponent(emailRef.current) + '&select=id');
      const id = Array.isArray(rows) ? rows[0]?.id : undefined;
      if (!id) return;
      await sbPatch('profiles', id, {
        last_lat: lat,
        last_lng: lng,
        last_loc_at: lat != null ? new Date().toISOString() : null,
        last_order_pi: pi || null,
      });
    } catch {
      return;
    }
  }, []);

  const start = useCallback(
    (orderPi: string | null) => {
      activePiRef.current = orderPi || null;
      if (watchIdRef.current !== null) return;
      if (!navigator.geolocation) return;
      if (intervalIdRef.current !== null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          if (now - lastSentRef.current > LOCATION_WATCH_MIN_GAP_MS) {
            lastSentRef.current = now;
            patchMyLoc(pos.coords.latitude, pos.coords.longitude, activePiRef.current);
          }
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 },
      );
      intervalIdRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const now = Date.now();
            if (now - lastSentRef.current > LOCATION_INTERVAL_MIN_GAP_MS) {
              lastSentRef.current = now;
              patchMyLoc(pos.coords.latitude, pos.coords.longitude, activePiRef.current);
            }
          },
          () => {},
          { timeout: 5000, maximumAge: 60000 },
        );
      }, LOCATION_PATCH_INTERVAL_MS);
    },
    [patchMyLoc],
  );

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    patchMyLoc(null, null, null);
  }, [patchMyLoc]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalIdRef.current !== null) clearInterval(intervalIdRef.current);
    };
  }, []);

  return { start, stop };
}

export interface ArrivalCaptureResult {
  photo: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ArrivalCameraModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: ArrivalCaptureResult) => void;
}

export function ArrivalCameraModal({ open, onClose, onConfirm }: ArrivalCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Bumped by stopStream so a getUserMedia() promise that resolves AFTER the
  // modal already closed/retook can tell it's stale and stop the stream it
  // just got instead of assigning it to streamRef — otherwise that stream is
  // never released and the camera indicator stays on.
  const camGenRef = useRef(0);
  // Set when the user cancels/retakes while a confirm's uploadPhoto() retry
  // is still in flight, so that pending call's eventual continuation skips
  // firing onConfirm — otherwise a cancelled arrival could still get recorded
  // once the (up to ~48s) retry finally settles.
  const cancelledRef = useRef(false);

  const [photo, setPhoto] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locStatus, setLocStatus] = useState({ text: 'Getting location…', color: '#9ca3af' });
  const [cameraFailed, setCameraFailed] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const stopStream = useCallback(() => {
    camGenRef.current++;
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
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((s) => {
        if (gen !== camGenRef.current) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        setCameraFailed(false);
        setCamReady(true);
        if (videoRef.current) videoRef.current.srcObject = s;
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
    setLat(null);
    setLng(null);
    setCameraFailed(false);
    setConfirming(false);
    cancelledRef.current = false;
    setLocStatus({ text: 'Getting location…', color: '#9ca3af' });
    captureLocation();
    startCam();
    return () => {
      stopStream();
    };
  }, [open, captureLocation, startCam, stopStream]);

  const doSnap = useCallback(() => {
    const vid = videoRef.current, cvs = canvasRef.current;
    if (!vid || !cvs) return;
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

  /* Downscale to the same budget doSnap() uses (800px wide, q 0.6). Without this the picker
     handed back the camera roll's full-resolution file — a ~3 MB JPEG — and when the upload then
     failed, handleConfirm's fallback wrote all of it into the order's log as base64. One such
     photo was 4.1 MB, 81% of an Execution-tab query's entire payload. */
  const onFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = (ev) => {
        const raw = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const W = Math.min(img.naturalWidth || 800, 800);
          const H = Math.round(((img.naturalHeight || 600) * W) / (img.naturalWidth || 800));
          const cv = document.createElement('canvas');
          cv.width = W;
          cv.height = H;
          const ctx = cv.getContext('2d');
          if (!ctx) { setPhoto(raw); return; }
          ctx.drawImage(img, 0, 0, W, H);
          try { setPhoto(cv.toDataURL('image/jpeg', 0.6)); } catch { setPhoto(raw); }
        };
        img.onerror = () => setPhoto(raw);
        img.src = raw;
        if (lat === null) captureLocation({ timeout: 5000, enableHighAccuracy: true });
      };
      rd.readAsDataURL(file);
      e.target.value = '';
    },
    [lat, captureLocation],
  );

  const retake = useCallback(() => {
    cancelledRef.current = true;
    setPhoto(null);
    setCameraFailed(false);
    startCam();
  }, [startCam]);

  const handleClose = useCallback(() => {
    cancelledRef.current = true;
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    let ph = photo;
    if (ph) {
      try {
        ph = await uploadPhoto(ph);
      } catch {
        /* keep raw captured data URL */
      }
    }
    setConfirming(false);
    if (cancelledRef.current) return;
    handleClose();
    onConfirm({ photo: ph, lat, lng });
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
            <p className="text-sm">Camera unavailable. Take a photo instead.</p>
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
            onClick={() => (cameraFailed ? fileInputRef.current?.click() : doSnap())}
            disabled={!cameraFailed && !camReady}
            className="rounded-xl bg-blue-600 px-6 py-3 text-base font-extrabold text-white disabled:opacity-40"
          >
            {cameraFailed ? 'Open Camera' : 'Take Photo'}
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

export interface DocScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScanned: (url: string) => void;
}

const DS_DEFAULT_CORNERS: SketchPoint[] = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
];
const DS_MAX_OUTPUT_DIM = 900;
const DS_HANDLE_INDICES = [0, 1, 2, 3] as const;

function dsHomography(fromPts: SketchPoint[], toPts: SketchPoint[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: fx, y: fy } = fromPts[i];
    const { x: tx, y: ty } = toPts[i];
    A.push([fx, fy, 1, 0, 0, 0, -fx * tx, -fy * tx]);
    b.push(tx);
    A.push([0, 0, 0, fx, fy, 1, -fx * ty, -fy * ty]);
    b.push(ty);
  }
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let mx = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[mx][c])) mx = r;
    [M[c], M[mx]] = [M[mx], M[c]];
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[c][c]) < 1e-12) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  const h = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    h[i] = M[i][n];
    for (let j = i + 1; j < n; j++) h[i] -= M[i][j] * h[j];
    h[i] = Math.abs(M[i][i]) < 1e-12 ? 0 : h[i] / M[i][i];
  }
  return [...h, 1];
}

function dsWarp(srcCv: HTMLCanvasElement, srcPts: SketchPoint[], outW: number, outH: number): HTMLCanvasElement {
  const dst: SketchPoint[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  const H = dsHomography(dst, srcPts);
  const oc = document.createElement('canvas');
  oc.width = outW;
  oc.height = outH;
  const octx = oc.getContext('2d')!;
  const sctx = srcCv.getContext('2d')!;
  const sd = sctx.getImageData(0, 0, srcCv.width, srcCv.height);
  const od = octx.createImageData(outW, outH);
  const sw = srcCv.width, sh = srcCv.height, src = sd.data, out = od.data;
  for (let oy = 0; oy < outH; oy++) {
    let nx = H[1] * oy + H[2], ny = H[4] * oy + H[5], d = H[7] * oy + H[8];
    for (let ox = 0; ox < outW; ox++, nx += H[0], ny += H[3], d += H[6]) {
      const sx = nx / d, sy = ny / d, oi = (oy * outW + ox) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        out[oi] = out[oi + 1] = out[oi + 2] = 255;
        out[oi + 3] = 255;
        continue;
      }
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const p00 = src[(y0 * sw + x0) * 4 + c];
        const p10 = src[(y0 * sw + x0 + 1) * 4 + c];
        const p01 = src[(y0 * sw + x0 + sw) * 4 + c];
        const p11 = src[(y0 * sw + x0 + 1 + sw) * 4 + c];
        out[oi + c] = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
      }
      out[oi + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return oc;
}

function dsEnhanceCanvas(cv: HTMLCanvasElement): void {
  const ctx = cv.getContext('2d')!;
  const d = ctx.getImageData(0, 0, cv.width, cv.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const e = Math.min(255, Math.max(0, (g - 128) * 1.6 + 128));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = e;
  }
  ctx.putImageData(d, 0, 0);
}

export function DocScannerModal({ open, onClose, onScanned }: DocScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgContainerRef = useRef<HTMLDivElement | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camGenRef = useRef(0);
  // apply() defers its actual work by 80ms; if the user hits Retake/Cancel
  // inside that window the deferred callback would still run, warp the STALE
  // captured frame, and re-close/re-scan over whatever the user just chose
  // instead — bump this so the deferred callback can tell it's stale and bail.
  const applySeqRef = useRef(0);

  const [phase, setPhase] = useState<'camera' | 'review'>('camera');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [corners, setCorners] = useState<SketchPoint[]>(DS_DEFAULT_CORNERS);
  const [enhance, setEnhance] = useState(false);
  const [applying, setApplying] = useState(false);
  const [, setLayoutTick] = useState(0);

  const stopCam = useCallback(() => {
    camGenRef.current++;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCam = useCallback(() => {
    const gen = ++camGenRef.current;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((s) => {
        if (gen !== camGenRef.current) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => {
        if (gen !== camGenRef.current) return;
        stopCam();
        onClose();
        if (typeof window !== 'undefined') window.alert('Cannot access camera. Please allow camera access.');
      });
  }, [onClose, stopCam]);

  useEffect(() => {
    if (!open) return;
    setPhase('camera');
    setEnhance(false);
    setPreviewSrc(null);
    setCorners(DS_DEFAULT_CORNERS);
    startCam();
    return () => {
      stopCam();
    };
  }, [open, startCam, stopCam]);

  useEffect(() => {
    const onResize = () => setLayoutTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const getImgRect = useCallback(() => {
    const img = previewImgRef.current, container = imgContainerRef.current;
    if (!img || !container) return { left: 0, top: 0, width: 0, height: 0 };
    const c = container.getBoundingClientRect();
    const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
    const sc = Math.min(c.width / nw, c.height / nh);
    const iw = nw * sc, ih = nh * sc;
    return { left: (c.width - iw) / 2, top: (c.height - ih) / 2, width: iw, height: ih };
  }, []);

  const capture = useCallback(() => {
    const vid = videoRef.current, srcCv = srcCanvasRef.current;
    if (!vid || !srcCv) return;
    srcCv.width = vid.videoWidth || 1280;
    srcCv.height = vid.videoHeight || 720;
    srcCv.getContext('2d')!.drawImage(vid, 0, 0);
    stopCam();
    setPreviewSrc(srcCv.toDataURL('image/jpeg', 0.92));
    setPhase('review');
  }, [stopCam]);

  const handlePreviewLoad = useCallback(() => {
    setCorners(DS_DEFAULT_CORNERS);
    setLayoutTick((t) => t + 1);
  }, []);

  const retake = useCallback(() => {
    applySeqRef.current++;
    setPhase('camera');
    startCam();
  }, [startCam]);

  const handleClose = useCallback(() => {
    applySeqRef.current++;
    stopCam();
    onClose();
  }, [stopCam, onClose]);

  const dragCorner = useCallback(
    (idx: number, clientX: number, clientY: number) => {
      const container = imgContainerRef.current;
      if (!container) return;
      const rect = getImgRect();
      const con = container.getBoundingClientRect();
      const lx = clientX - con.left, ly = clientY - con.top;
      const nx = Math.max(0, Math.min(1, (lx - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (ly - rect.top) / rect.height));
      setCorners((prev) => prev.map((c, i) => (i === idx ? { x: nx, y: ny } : c)));
    },
    [getImgRect],
  );

  const apply = useCallback(() => {
    const seq = ++applySeqRef.current;
    setApplying(true);
    window.setTimeout(() => {
      if (seq !== applySeqRef.current) return;
      try {
        const srcCv = srcCanvasRef.current;
        if (!srcCv) throw new Error('missing source canvas');
        const nw = srcCv.width, nh = srcCv.height;
        const sp = corners.map((c) => ({ x: c.x * nw, y: c.y * nh }));
        const dist = (a: SketchPoint, b: SketchPoint) => Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
        let outW = Math.round((dist(sp[0], sp[1]) + dist(sp[3], sp[2])) / 2);
        let outH = Math.round((dist(sp[0], sp[3]) + dist(sp[1], sp[2])) / 2);
        if (outW > DS_MAX_OUTPUT_DIM || outH > DS_MAX_OUTPUT_DIM) {
          const s = DS_MAX_OUTPUT_DIM / Math.max(outW, outH);
          outW = Math.round(outW * s);
          outH = Math.round(outH * s);
        }
        const oc = dsWarp(srcCv, sp, outW, outH);
        if (enhance) dsEnhanceCanvas(oc);
        const dataURL = oc.toDataURL('image/jpeg', 0.88);
        setApplying(false);
        handleClose();
        uploadPhoto(dataURL)
          .then((u) => onScanned(u))
          .catch(() => onScanned(dataURL));
      } catch (e) {
        console.error(e);
        setApplying(false);
        if (typeof window !== 'undefined') window.alert('Scan failed — try again.');
      }
    }, 80);
  }, [corners, enhance, handleClose, onScanned]);

  if (!open) return null;

  const rect = phase === 'review' ? getImgRect() : { left: 0, top: 0, width: 0, height: 0 };
  const points = corners.map((c) => ({ x: rect.left + c.x * rect.width, y: rect.top + c.y * rect.height }));

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black text-white">
      <canvas ref={srcCanvasRef} className="hidden" />

      {phase === 'camera' && (
        <>
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex items-center justify-center gap-3 p-4 pb-6">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border-2 border-gray-500 bg-transparent px-6 py-3 text-base font-extrabold text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={capture}
              className="rounded-xl bg-blue-600 px-6 py-3 text-base font-extrabold text-white"
            >
              Capture
            </button>
          </div>
        </>
      )}

      {phase === 'review' && (
        <>
          <div ref={imgContainerRef} className="relative flex-1 overflow-hidden">
            {previewSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={previewImgRef}
                src={previewSrc}
                alt="Captured document"
                onLoad={handlePreviewLoad}
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <polygon
                points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                className="fill-blue-500/20 stroke-blue-400"
                strokeWidth={2}
              />
            </svg>
            {DS_HANDLE_INDICES.map((idx) => (
              <div
                key={idx}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.buttons !== 1) return;
                  dragCorner(idx, e.clientX, e.clientY);
                }}
                className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-blue-500/80"
                style={{ left: points[idx]?.x ?? 0, top: points[idx]?.y ?? 0 }}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-3 p-4 pb-6">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border-2 border-gray-500 bg-transparent px-5 py-3 text-sm font-extrabold text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={retake}
              className="rounded-xl border-2 border-gray-500 bg-transparent px-5 py-3 text-sm font-extrabold text-white"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={() => setEnhance((e) => !e)}
              className={cn(
                'rounded-xl px-5 py-3 text-sm font-extrabold',
                enhance ? 'bg-amber-900 text-amber-400' : 'bg-gray-700 text-gray-300',
              )}
            >
              {enhance ? 'B&W ON' : 'B&W'}
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={applying}
              className="rounded-xl bg-green-600 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-40"
            >
              {applying ? 'Processing…' : 'Apply Scan'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
