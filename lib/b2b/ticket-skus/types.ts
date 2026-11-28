export interface SkuLine {
  sku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
}

export type TicketSkus =
  | { status: 'found'; source: 'cart' | 'order'; lines: SkuLine[] }
  | { status: 'none' };
