import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_BASE_URL || 'https://api-dev2.materialdepot.in/apiV1';

/* Thrown by getToken so the catch-all below can answer 401 instead of folding
   a missing login into a generic 500. */
class AuthError extends Error {}

function getToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new AuthError('Not authenticated');
  return token;
}

function authHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

const SCAN_PAGE_SIZE = 1000;
/* Upstream exposes no server-side search, so filtering means holding the rows
   here. A branch listing arrives whole in one request; the cross-branch
   `all=True` listing has to be walked, and 71k+ rows is more than one request
   should drag through this function — hence a cap, reported honestly to the
   caller rather than silently trimming the result. */
const SCAN_MAX_PAGES = 25;
const SCAN_CONCURRENCY = 6;

/* The cross-branch scan drags up to 25k rows through this function, and both the
   facet build and every page of a filtered listing re-trigger it — paging 1→2→3
   of an all-stores search used to re-scan the whole table three times, and the
   facet call scans it once more. Cache the scanned rows briefly so facets, the
   listing, and paging share a single scan. The rows are the shared
   product-location catalog (identical for every caller, not per-user), so the
   cache is keyed by scope alone; the short TTL bounds how long a movement or
   removal can stay hidden from a browse screen. */
const SCAN_TTL_MS = 60_000;
const scanCache = new Map<string, { at: number; data: { items: any[]; truncated: boolean } }>();

async function scanLocations(
  token: string,
  opts: { branch_id?: string | number; is_deleted?: boolean },
): Promise<{ items: any[]; truncated: boolean }> {
  const key = opts.branch_id ? `b:${opts.branch_id}` : 'all';
  const hit = scanCache.get(key);
  if (hit && Date.now() - hit.at < SCAN_TTL_MS) return hit.data;
  const data = await runScan(token, opts);
  /* Never cache an empty scan: runScan swallows a failed upstream fetch as an
     empty batch (the `if (!res.ok) return null` below), and pinning that for the
     full TTL would blank the screen even after upstream recovered. */
  if (data.items.length) scanCache.set(key, { at: Date.now(), data });
  return data;
}

async function runScan(
  token: string,
  { branch_id }: { branch_id?: string | number; is_deleted?: boolean },
): Promise<{ items: any[]; truncated: boolean }> {
  const get = async (page: number) => {
    const url = branch_id
      ? `${API_BASE}/fetch-variant-locations/?branch_id=${branch_id}&page=${page}&page_size=${SCAN_PAGE_SIZE}`
      : `${API_BASE}/fetch-variant-locations/?all=True&page=${page}&page_size=${SCAN_PAGE_SIZE}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  };

  const first = await get(1);
  const firstBatch = first?.data ?? [];
  if (!firstBatch.length) return { items: [], truncated: false };

  // A branch listing ignores pagination upstream — page 1 already holds the
  // whole branch, so there is nothing further to ask for.
  if (branch_id) return { items: firstBatch, truncated: false };

  const totalPages = Math.max(1, first?.total_pages ?? 1);
  const wanted = Math.min(totalPages, SCAN_MAX_PAGES);
  const items = [...firstBatch];

  /* Fetched in bounded parallel rather than one after another: the cross-branch
     table is 70k+ rows, and walking it a page at a time made every filtered
     search wait on ~25 sequential round-trips. */
  for (let page = 2; page <= wanted; page += SCAN_CONCURRENCY) {
    const batch = [];
    for (let i = page; i < Math.min(page + SCAN_CONCURRENCY, wanted + 1); i++) batch.push(get(i));
    const results = await Promise.all(batch);
    for (const r of results) {
      const rows = r?.data ?? [];
      if (rows.length) items.push(...rows);
    }
  }

  return { items, truncated: totalPages > wanted };
}

async function proxyResponse(apiRes: Response) {
  const data = await apiRes.json().catch(() => ({}));
  if (!apiRes.ok) {
    return NextResponse.json({ error: data }, { status: apiRes.status });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { _action, ...payload } = body;

    switch (_action) {
      // ── Variant Store Movement ──────────────────────────────────
      /* Returns the distinct categories / display types across the WHOLE scope,
         not just whatever landed on page 1. Both list screens used to build
         their dropdowns from a single 500-row page, which on a 71k-row table
         meant the filter options were an arbitrary sample. */
      case 'fetch_facets': {
        const token = getToken(req);
        const { branch_id, is_deleted } = payload;
        const scan = await scanLocations(token, { branch_id, is_deleted });
        const categories = new Set<string>();
        const displayTypes = new Set<string>();
        for (const item of scan.items) {
          const c = item.location?.category;
          const d = item.location?.display_type;
          if (c) categories.add(c);
          if (d) displayTypes.add(d);
        }
        return NextResponse.json({
          status: true,
          categories: [...categories].sort(),
          display_types: [...displayTypes].sort(),
          truncated: scan.truncated,
          scanned: scan.items.length,
        });
      }

      case 'fetch_locations': {
        const token = getToken(req);
        const { branch_id, branch_name, page = 1, search, category, display_type, is_active, is_deleted, page_size = 30 } = payload;
        if (branch_name) {
          const res = await fetch(`${API_BASE}/fetch-variant-locations/`, {
            method: 'POST',
            headers: authHeaders(token),
            body: JSON.stringify({ branch_name }),
          });
          return proxyResponse(res);
        }

        const pageNum = Math.max(1, Number(page) || 1);
        const size = Math.max(1, Number(page_size) || 30);
        /* A branch_id listing is paginated locally too: upstream ignores
           page/page_size for a branch and returns the whole branch in one shot
           (see scanLocations), so forwarding page_size to it silently returns
           every row on one page. Only the cross-branch all=True listing honours
           upstream pagination. */
        const needsLocalFilter = !!(branch_id || category || display_type || is_active !== undefined || is_deleted !== undefined);

        if (!needsLocalFilter) {
          let url = branch_id
            ? `${API_BASE}/fetch-variant-locations/?branch_id=${branch_id}`
            : `${API_BASE}/fetch-variant-locations/?all=True`;
          url += `&page=${pageNum}&page_size=${size}`;
          if (search) url += `&product_name=${encodeURIComponent(search)}`;
          const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
          if (res.ok) {
            const text = await res.text();
            try {
              const data = JSON.parse(text);
              return NextResponse.json(data);
            } catch {
              // Backend returned non-JSON (e.g. "Backend call failure") — fall through to scanLocations
            }
          }
          // If no search, don't fall through — return the error
          if (!search) {
            return NextResponse.json({ error: `API server error (${res.status})` }, { status: 502 });
          }
        }

        const scan = await scanLocations(token, { branch_id, is_deleted: undefined });
        let filtered = scan.items;

        if (search) {
          const q = String(search).toLowerCase();
          filtered = filtered.filter((item: any) => {
            const v = item.variant ?? {};
            const l = item.location ?? {};
            return (
              (v.product_name ?? '').toLowerCase().includes(q) ||
              (v.sku ?? '').toLowerCase().includes(q) ||
              (v.variant_handle ?? '').toLowerCase().includes(q) ||
              (v.private_label_product_name ?? '').toLowerCase().includes(q) ||
              (l.location_string ?? '').toLowerCase().includes(q)
            );
          });
        }

        if (category) {
          filtered = filtered.filter((item: any) => item.location?.category === category);
        }
        if (display_type) {
          filtered = filtered.filter((item: any) => item.location?.display_type === display_type);
        }
        if (is_active !== undefined) {
          filtered = filtered.filter((item: any) => item.location?.is_active === is_active);
        }
        if (is_deleted !== undefined) {
          filtered = filtered.filter((item: any) => item.variant?.is_deleted === is_deleted);
        }

        const total_count = filtered.length;
        const total_pages = Math.max(1, Math.ceil(total_count / size));
        const start = (pageNum - 1) * size;
        const paged = filtered.slice(start, start + size);

        return NextResponse.json({
          status: true,
          data: paged,
          page: pageNum,
          page_size: size,
          total_count,
          total_pages,
          /* Never let a capped scan pass for a complete one — the callers
             surface this, see StoreProducts/DiscontinuedList. */
          truncated: scan.truncated,
          scanned: scan.items.length,
        });
      }

      case 'fetch_movements': {
        const token = getToken(req);
        const res = await fetch(`${API_BASE}/initiate-variant-store-movement/`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
          return NextResponse.json({ error: `API error (${res.status})` }, { status: 502 });
        }
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data);
      }

      case 'movement_initiate': {
        const token = getToken(req);
        const res = await fetch(`${API_BASE}/initiate-variant-store-movement/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify(payload),
        });
        return proxyResponse(res);
      }

      case 'movement_in_progress': {
        const token = getToken(req);
        const res = await fetch(`${API_BASE}/initiate-variant-store-movement/`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify(payload),
        });
        return proxyResponse(res);
      }

      case 'movement_complete': {
        const token = getToken(req);
        const res = await fetch(`${API_BASE}/complete-variant-store-movement/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify(payload),
        });
        return proxyResponse(res);
      }

      case 'cancel_movement': {
        const token = getToken(req);
        const { vsm_id } = payload;
        if (!vsm_id || typeof vsm_id !== 'number') {
          return NextResponse.json({ error: 'vsm_id is required and must be a number' }, { status: 400 });
        }
        const res = await fetch(`${API_BASE}/cancel-variant-store-movement/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ vsm_id }),
        });
        return proxyResponse(res);
      }

      // ── Variant Store Removal ───────────────────────────────────
      case 'removal_initiate': {
        const token = getToken(req);
        const res = await fetch(`${API_BASE}/initiate-variant-store-removal/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify(payload),
        });
        return proxyResponse(res);
      }

      case 'removal_in_progress': {
        const token = getToken(req);
        const res = await fetch(`${API_BASE}/initiate-variant-store-removal/`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify(payload),
        });
        return proxyResponse(res);
      }

      case 'removal_complete': {
        const token = getToken(req);
        const res = await fetch(`${API_BASE}/complete-variant-store-removal/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify(payload),
        });
        return proxyResponse(res);
      }

      // ── Bulk Operations ─────────────────────────────────────────
      case 'bulk_upload': {
        const token = getToken(req);
        const { gsheet } = payload;
        if (!gsheet) return NextResponse.json({ error: 'gsheet URL is required' }, { status: 400 });
        const res = await fetch(`${API_BASE}/update-variant-store-location-map/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ gsheet }),
        });
        return proxyResponse(res);
      }

      case 'bulk_change_initiate': {
        const token = getToken(req);
        const { gsheet } = payload;
        if (!gsheet) return NextResponse.json({ error: 'gsheet URL is required' }, { status: 400 });
        const res = await fetch(`${API_BASE}/bulk-initiate-variant-store-movement/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ gsheet }),
        });
        return proxyResponse(res);
      }

      case 'bulk_change_complete': {
        const token = getToken(req);
        const { gsheet } = payload;
        if (!gsheet) return NextResponse.json({ error: 'gsheet URL is required' }, { status: 400 });
        const res = await fetch(`${API_BASE}/bulk-complete-variant-store-movement/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ gsheet }),
        });
        return proxyResponse(res);
      }

      case 'delete_locations': {
        const token = getToken(req);
        const { vsl_ids } = payload;
        if (!Array.isArray(vsl_ids) || vsl_ids.length === 0) {
          return NextResponse.json({ error: 'vsl_ids must be a non-empty array' }, { status: 400 });
        }
        const res = await fetch(`${API_BASE}/delete-variant-store-locations/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ vsl_ids }),
        });
        return proxyResponse(res);
      }

      // ── EC Products (md-api-proxy) ──────────────────────────────
      case 'get_ec_products': {
        // This was the one action that forwarded no Authorization header. The
        // upstream requires one (it answers 401 without it), so the "Get all EC
        // Products" button could never have worked.
        const token = getToken(req);
        const { branch_name } = payload;
        if (!branch_name) return NextResponse.json({ error: 'branch_name is required' }, { status: 400 });
        const res = await fetch(`${API_BASE}/fetch-variant-locations/`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ branch_name }),
        });
        return proxyResponse(res);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${_action}` }, { status: 400 });
    }
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
