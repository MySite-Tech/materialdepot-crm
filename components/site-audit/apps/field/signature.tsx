'use client';

import { SIGN_EXPORT_LINE_WIDTH, SIGN_EXPORT_QUALITY, SIGN_EXPORT_RATIO_FALLBACK, SIGN_EXPORT_WIDTH, SIGN_LINE_WIDTH, SIGN_STROKE_COLOR } from '../../constants/field-app';
import { SignaturePadHandle, SignaturePadProps, SketchPoint, SketchStroke } from '../../types/field-app';
import { cn } from '@/lib/utils/index';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

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
