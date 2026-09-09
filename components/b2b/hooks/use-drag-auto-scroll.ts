'use client';

import { useEffect, useRef, type DragEvent } from 'react';

const DRAG_SCROLL_EDGE = 60;
const DRAG_SCROLL_SPEED = 16;

export function useDragAutoScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const frame = useRef<number | null>(null);

  const stop = () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const onDragOver = (e: DragEvent) => {
    const el = ref.current;
    if (!el) return;
    const { left, right } = el.getBoundingClientRect();
    const dx = e.clientX - left < DRAG_SCROLL_EDGE ? -DRAG_SCROLL_SPEED
      : right - e.clientX < DRAG_SCROLL_EDGE ? DRAG_SCROLL_SPEED
      : 0;
    stop();
    if (dx !== 0) {
      const tick = () => { el.scrollLeft += dx; frame.current = requestAnimationFrame(tick); };
      frame.current = requestAnimationFrame(tick);
    }
  };

  useEffect(() => stop, []);

  return { ref, onDragOver, onDragEnd: stop, onDrop: stop };
}
