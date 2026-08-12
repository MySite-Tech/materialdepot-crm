import type { NextRequest } from 'next/server';

/* Given ?url=<materialdepot.com product page>, fetches it server-side (the
   browser can't, for CORS) and scrapes its og:image — falling back to
   twitter:image — so the BM dashboard can show a product thumbnail from a
   pasted product URL. Port of material-depot-site's api/fetch-og-image.js.

   Host-allowlisted to *.materialdepot.com on BOTH the requested URL and the
   final URL after redirects: checking only the requested URL would let a
   materialdepot.com page redirect elsewhere and have this route fetch
   arbitrary attacker-controlled URLs (SSRF). */

export const dynamic = 'force-dynamic';

const ALLOWED_HOST = /(^|\.)materialdepot\.com$/i;

export async function GET(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get('url') || '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return Response.json({ error: 'invalid url' }, { status: 400 });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return Response.json({ error: 'host not allowed' }, { status: 400 });
  if (!ALLOWED_HOST.test(target.hostname)) return Response.json({ error: 'host not allowed' }, { status: 400 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  let r: Response;
  try {
    r = await fetch(target.href, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaterialDepotBot/1.0)' },
      cache: 'no-store',
    });
  } catch {
    clearTimeout(timer);
    return Response.json({ error: 'fetch failed or timed out' }, { status: 504 });
  }
  clearTimeout(timer);

  let finalHost = '';
  try { finalHost = new URL(r.url).hostname; } catch { /* keep empty → rejected below */ }
  if (!ALLOWED_HOST.test(finalHost)) return Response.json({ error: 'redirected off allowed host' }, { status: 400 });

  if (!r.ok) return Response.json({ image: null });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return Response.json({ image: null });
  const len = parseInt(r.headers.get('content-length') || '0', 10);
  if (len && len > 3_000_000) return Response.json({ image: null });

  let html = await r.text();
  if (html.length > 1_000_000) html = html.slice(0, 1_000_000);

  const patterns = [
    /<meta\s+[^>]*?(?:property|name)=["']og:image["'][^>]*?content=["']([^"']*)["']/i,
    /<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']og:image["']/i,
    /<meta\s+[^>]*?(?:property|name)=["']twitter:image["'][^>]*?content=["']([^"']*)["']/i,
  ];
  let img: string | null = null;
  for (const p of patterns) {
    const m = html.match(p);
    if (m) { img = m[1]; break; }
  }
  if (img) {
    try { img = new URL(img, r.url).href; } catch { /* keep the raw value */ }
  }

  return Response.json({ image: img || null }, { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } });
}
