'use client';

import { Period } from '../../../models/outreach/kpis';
import { useOrderCredits } from '../../../order-credit/hooks/use-order-credits';
import { useMonthReport } from '../../overview/hooks/use-month-report';
import { RevenueOrder, applyCredits, fetchRevenueReport } from '@/lib/b2b/revenue';
import { useMemo } from 'react';

export type OrdersState = 'loading' | 'ready' | 'failed';

export function useOutreachOrders(period: Period, enabled: boolean): { orders: RevenueOrder[] | null; state: OrdersState } {
  const sales = useMonthReport(fetchRevenueReport, period.from, period.to, enabled, 0, 'Orders could not be read');
  const { credits, state: creditsState } = useOrderCredits();
  const orders = useMemo(() => (sales.report ? applyCredits(sales.report.orders, credits) : null), [sales.report, credits]);
  const state: OrdersState = orders ? (creditsState === 'loading' ? 'loading' : 'ready') : sales.error ? 'failed' : 'loading';
  return { orders, state };
}
