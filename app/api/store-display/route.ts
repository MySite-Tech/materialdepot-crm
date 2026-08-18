import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_BASE_URL || 'https://api-dev2.materialdepot.in/apiV1';

function getToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Not authenticated');
  return token;
}

function authHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
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
      case 'fetch_locations': {
        const { branch_id, branch_name, page = 1, search, category, display_type, is_active, is_deleted, page_size = 30 } = payload;
        if (branch_name) {
          const res = await fetch(`${API_BASE}/fetch-variant-locations/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch_name }),
          });
          return proxyResponse(res);
        }

        const needsFilter = search || category || display_type || is_active !== undefined || is_deleted !== undefined;

        if (!needsFilter) {
          let url = branch_id
            ? `${API_BASE}/fetch-variant-locations/?branch_id=${branch_id}`
            : `${API_BASE}/fetch-variant-locations/?all=True`;
          url += `&page=${page}&page_size=${page_size}`;
          const res = await fetch(url);
          if (!res.ok) {
            return NextResponse.json({ error: `API server error (${res.status})` }, { status: 502 });
          }
          const data = await res.json().catch(() => ({}));
          return NextResponse.json(data);
        }

        const allItems: any[] = [];
        const fetchSize = 1000;
        let fetchPage = 1;
        const maxPages = 10;

        while (fetchPage <= maxPages) {
          let url = branch_id
            ? `${API_BASE}/fetch-variant-locations/?branch_id=${branch_id}`
            : `${API_BASE}/fetch-variant-locations/?all=True`;
          url += `&page=${fetchPage}&page_size=${fetchSize}`;
          const res = await fetch(url);
          if (!res.ok) break;
          const data = await res.json().catch(() => ({}));
          const items = data?.data ?? [];
          if (items.length === 0) break;
          allItems.push(...items);
          if (fetchPage >= (data?.total_pages ?? 1)) break;
          fetchPage++;
        }

        let filtered = allItems;

        if (search) {
          const q = search.toLowerCase();
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
        const total_pages = Math.max(1, Math.ceil(total_count / page_size));
        const start = (page - 1) * page_size;
        const paged = filtered.slice(start, start + page_size);

        return NextResponse.json({
          status: true,
          data: paged,
          page,
          page_size,
          total_count,
          total_pages,
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
        const { branch_name } = payload;
        if (!branch_name) return NextResponse.json({ error: 'branch_name is required' }, { status: 400 });
        const res = await fetch(`${API_BASE}/fetch-variant-locations/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch_name }),
        });
        return proxyResponse(res);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${_action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
