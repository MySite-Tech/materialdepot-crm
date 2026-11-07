export const ORDER_PAGE_SIZE = 25;

export const ORDER_TABS = [
  { key: 'placed', label: 'Orders', empty: 'No placed order on these numbers yet.' },
  { key: 'pi', label: 'PI shared', empty: 'No PI waiting on the client.' },
  { key: 'open', label: 'Open carts', empty: 'No open cart.' },
  { key: 'lost', label: 'Lost', empty: 'Nothing lost.' },
] as const;
