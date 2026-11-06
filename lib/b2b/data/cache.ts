const TTL_MS = 8000;
const cache = new Map<string, { ts: number; promise: Promise<any> }>();

if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.ts >= TTL_MS) cache.delete(key);
    }
  }, TTL_MS * 2);
}

export function withB2BCache<T>(key: string, run: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < TTL_MS) return hit.promise as Promise<T>;

  const promise = run();
  cache.set(key, { ts: now, promise });
  promise.catch(() => cache.delete(key));
  return promise;
}

const writeListeners = new Set<() => void>();

export function onB2BWrite(fn: () => void): () => void {
  writeListeners.add(fn);
  return () => { writeListeners.delete(fn); };
}

export function invalidateB2BCache() {
  cache.clear();
  for (const fn of writeListeners) fn();
}
