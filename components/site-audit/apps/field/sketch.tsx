'use client';

import { SKETCH_DOT_SPACING, SKETCH_EXPORT_LINE_WIDTH, SKETCH_EXPORT_QUALITY, SKETCH_EXPORT_WIDTH, SKETCH_LINE_WIDTH, SKETCH_STROKE_COLOR } from './constants';
import { SketchCanvasHandle, SketchCanvasProps, SketchPoint, SketchStroke } from '../types/field-app';
import { cloneStrokes } from './utils';
import { cn } from '@/lib/utils';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

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
