import { mdFetch } from '../api';

export function flattenLocationRow(row: any) {
  return {
    id: row.id,
    location_id: row.location?.id ?? null,
    branch_id: row.location?.branch_id ?? '',
    branch_name: row.location?.branch ?? '',
    variant_handle: row.variant?.variant_handle ?? '',
    product_name: row.variant?.product_name ?? '',
    sku: row.variant?.sku ?? null,
    category: row.location?.category ?? '',
    display_type: row.location?.display_type ?? '',
    location_string: row.location?.location_string ?? '',

    is_active: row.is_active ?? true,
    is_deleted: row.variant?.is_deleted ?? false,
    image_url: row.variant?.variant_image?.[0]?.image_url ?? null,
    quantity: row.quantity ?? 0,
    private_label_product_name: row.variant?.private_label_product_name ?? null,
    private_label_brand: row.variant?.variant_private_label_brand ?? null,
  };
}

interface FetchLocationsParams {
  branch_id?: string | number;
  page?: number;
  page_size?: number;

  search?: string;
  category?: string;
  display_type?: string;
  is_active?: boolean;
  is_deleted?: boolean;
}

interface LocationsPage {
  status: boolean;
  data: any[];
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
  truncated?: boolean;
  scanned?: number;
}

function locationsQuery(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  return q.toString();
}

export async function fetchLocations(params: FetchLocationsParams): Promise<LocationsPage> {
  const query = locationsQuery({
    page: Math.max(1, Number(params.page) || 1),
    page_size: Math.max(1, Number(params.page_size) || 30),
    branch_id: params.branch_id,
    product_name: params.search?.trim() || undefined,
    category: params.category,
    display_type: params.display_type,
    is_active: params.is_active,
    is_deleted: params.is_deleted,
  });
  return mdFetch(`/fetch-variant-locations/?${query}`);
}

export async function fetchFacets(branch_id?: string | number, is_active?: boolean): Promise<{ categories: string[]; display_types: string[] }> {
  const q = locationsQuery({ branch_id, is_active });
  const data = await mdFetch(`/variant-location-facets/${q ? `?${q}` : ''}`, { method: 'GET' });
  return { categories: data?.categories ?? [], display_types: data?.display_types ?? [] };
}

async function fetchLocationsByBranchName(branch_name: string): Promise<any> {
  return mdFetch(`/fetch-variant-locations/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch_name }),
  });
}

export type MovementType = 'add_display' | 'move_display' | 'remove_display';

interface InitiateMovementPayload {
  movement_type: MovementType;
  variant_handle: string;
  quantity?: number;

  from_location_id?: number | null;
  display_type_to?: string;
  location_string_to?: string;

  location_id?: number | null;
  branch_id?: string | number;

  removal_reason?: 'discontinued_permanently' | 'retired_from_store_display';
  additional_remarks?: string;
  assigned_to_id?: number | null;
}

function post(path: string, payload: Record<string, any>): Promise<any> {
  return mdFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function initiateMovement(payload: InitiateMovementPayload): Promise<any> {
  return post(`/v2/initiate-variant-store-movement/`, payload);
}

export async function completeMovement(vsm_id: number): Promise<any> {
  return post(`/v2/complete-variant-store-movement/`, { vsm_id });
}

export async function cancelMovement(vsm_id: number): Promise<any> {
  return post(`/cancel-variant-store-movement/`, { vsm_id });
}

export async function fetchMovements(movement_type?: MovementType): Promise<any> {
  const qs = movement_type ? `?movement_type=${movement_type}` : '';
  return mdFetch(`/v2/initiate-variant-store-movement/${qs}`, { method: 'GET' });
}

export async function deleteLocations(vsl_ids: number[]): Promise<any> {
  return post(`/delete-variant-store-locations/`, { vsl_ids });
}

export async function bulkUploadLocations(gsheet: string): Promise<any> {
  return post(`/update-variant-store-location-map/`, { gsheet });
}

export async function bulkChangeInitiate(gsheet: string): Promise<any> {
  return post(`/bulk-initiate-variant-store-movement/`, { gsheet });
}

export async function bulkChangeComplete(gsheet: string): Promise<any> {
  return post(`/bulk-complete-variant-store-movement/`, { gsheet });
}

export async function getEcProducts(branch_name: string): Promise<any> {
  return fetchLocationsByBranchName(branch_name);
}
