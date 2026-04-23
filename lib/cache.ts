interface CacheEntry {
  data: unknown;
  expiry: number;
}

const store = new Map<string, CacheEntry>();

const DEFAULT_TTL = 300_000; // 5 minutes

export function getCached(key: string): unknown | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key: string, data: unknown, ttl = DEFAULT_TTL) {
  store.set(key, { data, expiry: Date.now() + ttl });
}

// Prevent unbounded growth — evict expired entries periodically
let lastCleanup = 0;
export function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.expiry) store.delete(key);
  }
}
