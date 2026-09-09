export async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await worker(items[i]);
      }
    }
  );
  await Promise.all(runners);
  return out;
}
export async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}
export async function pacedFetch(url: string, options?: RequestInit): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    try {
      const res = await fetch(url, { cache: "no-store", ...options });
      if (res.status === 429) continue;
      return res;
    } catch { return null; }
  }
  return null;
}
