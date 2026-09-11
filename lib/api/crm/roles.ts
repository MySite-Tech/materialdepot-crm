export const EXCLUDED_ROLES = new Set(['data', 'delivery']);

const PERMISSION_ID_TO_ROLE: Record<number, string> = {
  1: 'admin', 2: 'manager', 3: 'sales', 4: 'pre_sales', 5: 'procurement',
  6: 'delivery', 7: 'tech', 8: 'data', 9: 'accounts', 10: 'retail',
  11: 'customer_success', 12: 'store_manager', 13: 'delivery_manager',
  14: 'b2b_sales', 15: 'post_sales',
};

export function roleFromPermission(
  permission: { id?: unknown; permission_name?: unknown } | null | undefined,
): string {
  const named = permission?.permission_name;
  if (typeof named === 'string' && named) return named;
  return PERMISSION_ID_TO_ROLE[Number(permission?.id)] ?? '';
}
