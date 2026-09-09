let lastRequest = 0;
const MIN_GAP = 500; // 500ms between requests = max 2/sec

export async function rateLimitedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, lastRequest + MIN_GAP - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      lastRequest = Date.now();
      continue;
    }
    return res;
  }
  return fetch(url, options);
}
