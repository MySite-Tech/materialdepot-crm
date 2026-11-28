export const ORDER_PAGE_SIZE = 25;

export const LABEL_CLS = 'text-[11.5px] font-medium text-gray-500';

export const LINK_CLS = 'text-[12px] font-medium text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap';

export const ORDER_TABS = [
  { key: 'placed', label: 'Orders', empty: 'No placed order on these numbers yet.' },
  { key: 'pi', label: 'PI shared', empty: 'No PI waiting on the client.' },
  { key: 'open', label: 'Open carts', empty: 'No open cart.' },
  { key: 'lost', label: 'Lost', empty: 'Nothing lost.' },
] as const;
