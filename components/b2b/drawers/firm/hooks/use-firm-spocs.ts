'use client';

import { ClientEntity, FirmLinks, b2bSellerTest, firmSpocs, spocSales } from '../../../models/client';
import { Rep } from '../../../models/outreach/intake';
import type { ClientOrderRow } from '@/lib/b2b';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { useMemo } from 'react';

export function useFirmSpocs(client: ClientEntity, links: FirmLinks, orders: ClientOrderRow[], people: Record<B2BTeam, Rep[]>) {
  const isB2B = useMemo(() => b2bSellerTest(Object.values(people).flat().map((r) => r.name)), [people]);
  const spocs = useMemo(() => firmSpocs(client, links, orders, isB2B), [client, links, orders, isB2B]);
  const sales = useMemo(() => spocSales(client, spocs, orders, Date.now(), isB2B), [client, spocs, orders, isB2B]);
  return { isB2B, spocs, sales };
}
