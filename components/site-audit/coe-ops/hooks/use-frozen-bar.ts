'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

function measureStickyTop(el: HTMLElement | null): number {
  let total = 0;
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    for (let prev = node.previousElementSibling; prev; prev = prev.previousElementSibling) {
      if (!(prev instanceof HTMLElement)) continue;
      const cs = getComputedStyle(prev);
      if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
      const top = parseFloat(cs.top);

      if (!Number.isFinite(top) || top > 0) continue;
      total += prev.offsetHeight + top;
    }
  }
  return Math.max(0, Math.round(total));
}

type FrozenBarGeometry = {
  ref: (el: HTMLDivElement | null) => void;

  top: number;
};

export function useFrozenBar(): FrozenBarGeometry {
  const [top, setTop] = useState(0);
  const node = useRef<HTMLDivElement | null>(null);

  const remeasure = () => {
    const next = measureStickyTop(node.current);
    setTop((cur) => (cur === next ? cur : next));
  };

  useLayoutEffect(remeasure);

  useEffect(() => {

    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ref: (el) => { node.current = el; },
    top,
  };
}
