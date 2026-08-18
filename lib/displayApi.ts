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
    is_active: row.location?.is_active ?? true,
    is_deleted: row.variant?.is_deleted ?? false,
    image_url: row.variant?.variant_image?.[0]?.image_url ?? null,
    quantity: row.quantity ?? 0,
    private_label_product_name: row.variant?.private_label_product_name ?? null,
    private_label_brand: row.variant?.variant_private_label_brand ?? null,
  };
}

export async function displayApi(action: string, payload: Record<string, any> = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') || '' : '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch('/api/store-display', {
    method: 'POST',
    headers,
    body: JSON.stringify({ _action: action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) {
    const errMsg = typeof data.error === 'object'
      ? (data.error.message || data.error.detail || JSON.stringify(data.error))
      : (data.error || `Request failed (${res.status})`);
    throw new Error(errMsg);
  }
  return data;
}
