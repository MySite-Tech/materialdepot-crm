'use client';

export const FUNNEL_COLS = [
  { key: 'footfall_users', label: 'Footfall', color: 'text-gray-800' },
  { key: 'cart_users',     label: 'Cart',     color: 'text-blue-600' },
  { key: 'pi_users',       label: 'PI',       color: 'text-purple-600' },
  { key: 'order_users',    label: 'Order',    color: 'text-green-600' },
] as const;

export const PCT_COLS = [
  { key: 'cart_pct',    label: 'Cart Conv%' },
  { key: 'pi_pct',      label: 'PI Conv%' },
  { key: 'order_pct',   label: 'Order Conv%' },
] as const;

export const BM_PAGE_SIZE = 10;
