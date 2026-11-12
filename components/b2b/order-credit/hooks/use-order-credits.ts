'use client';

import { useContext, useEffect } from 'react';
import { OrderCreditsApi, OrderCreditsContext } from '../context';

export function useOrderCredits(): OrderCreditsApi {
  const api = useContext(OrderCreditsContext);
  const { load } = api;
  useEffect(() => { load(); }, [load]);
  return api;
}
