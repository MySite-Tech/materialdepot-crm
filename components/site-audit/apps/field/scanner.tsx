'use client';

import { DS_DEFAULT_CORNERS, DS_HANDLE_INDICES, DS_MAX_OUTPUT_DIM } from '../../constants/field-app';
import { DocScannerModalProps, SketchPoint } from '../../types/field-app';
import { dsEnhanceCanvas, dsWarp } from '../../utils/field-app';
import { uploadPhoto } from '@/components/site-audit/siteAuditShared';
import { cn } from '@/lib/utils/index';
import { useCallback, useEffect, useRef, useState } from 'react';

export function DocScannerModal({ open, onClose, onScanned }: DocScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgContainerRef = useRef<HTMLDivElement | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camGenRef = useRef(0);

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
