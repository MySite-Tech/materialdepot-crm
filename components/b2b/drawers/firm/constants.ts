export const ORDER_PAGE_SIZE = 25;

export const ORDER_TABS = [
  { key: 'placed', label: 'Orders', empty: 'No placed order on these numbers yet.' },
  { key: 'open', label: 'Open', empty: 'No open cart or quote.' },
  { key: 'lost', label: 'Lost', empty: 'Nothing lost.' },
] as const;

export const CONTACT_LABELS = ['Owner', 'Partner', 'Purchase', 'Accounts', 'Site', 'Designer'] as const;
