export const ORDER_PAGE_SIZE = 25;

export const ORDER_TABS = [
  { key: 'placed', label: 'Orders', empty: 'No placed order on these numbers yet.' },
  { key: 'open', label: 'Open carts', empty: 'No open cart or quote.' },
  { key: 'lost', label: 'Lost', empty: 'Nothing lost.' },
] as const;
