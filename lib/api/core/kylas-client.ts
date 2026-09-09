export const KYLAS_API_URL = "https://api.kylas.io/v1";
export const KYLAS_API_KEY = "84ff1db2-99bf-4634-9e24-1930c1cfcd6a:20007";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function kylasFetch(path: string, init?: RequestInit, maxRetries = 4) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${KYLAS_API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "api-key": KYLAS_API_KEY, ...init?.headers },
    });
    if (res.ok) return res.json();

    if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(500 * 2 ** attempt, 8000);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`API error: ${res.status}`);
  }
}
