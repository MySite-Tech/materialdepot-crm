export const STORE_CODE_TO_BRANCH_ID: Record<string, string> = {
  JP_ec: '1',
  YE_ec: '2',
  WF_ec: '36',
  KP_ec: '71',
  HSR_ec: '104',
  GB_ec: '69',
  BN_ec: '137',
};

export const BRANCH_ID_TO_STORE: Record<string, { code: string; name: string }> = {
  '1': { code: 'JP_ec', name: 'JP Nagar' },
  '2': { code: 'YE_ec', name: 'Yelahanka' },
  '36': { code: 'WF_ec', name: 'Whitefield' },
  '71': { code: 'KP_ec', name: 'Kompally' },
  '104': { code: 'HSR_ec', name: 'HSR Layout' },
  '69': { code: 'GB_ec', name: 'Gachibowli' },
  '137': { code: 'BN_ec', name: 'Basaveshwara Nagar' },
};

export const STORES = [
  { code: 'JP_ec', name: 'JP Nagar' },
  { code: 'YE_ec', name: 'Yelahanka' },
  { code: 'WF_ec', name: 'Whitefield' },
  { code: 'KP_ec', name: 'Kompally' },
  { code: 'HSR_ec', name: 'HSR Layout' },
  { code: 'GB_ec', name: 'Gachibowli' },
  { code: 'BN_ec', name: 'Basaveshwara Nagar' },
];

export const STORE_NAMES: Record<string, string> = {
  JP_ec: 'JP Nagar',
  YE_ec: 'Yelahanka',
  WF_ec: 'Whitefield',
  KP_ec: 'Kompally',
  HSR_ec: 'HSR Layout',
  GB_ec: 'Gachibowli',
  BN_ec: 'Basaveshwara Nagar',
};
