import { LOST_SET, ORDER_SET } from '../../constants/client';
export const dealIsOrder = (status: string | null | undefined): boolean => ORDER_SET.has(String(status || ''));

export const dealIsLost = (status: string | null | undefined): boolean => LOST_SET.has(String(status || ''));

export const dealIsOpen = (status: string | null | undefined): boolean => {
  const s = String(status || '');
  return !!s && !ORDER_SET.has(s) && !LOST_SET.has(s);
};

export function averageOrderValue(total: number | undefined, orders: number | undefined): number | undefined {
  if (!orders || !Number.isFinite(orders) || orders <= 0) return undefined;
  return (Number(total) || 0) / orders;
}

