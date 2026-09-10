
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
