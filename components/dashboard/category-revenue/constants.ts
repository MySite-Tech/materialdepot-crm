export const CORE_CATEGORIES = [
  'Tiles',
  'Laminates',
  'Panels',
  'Carpet Flooring',
  'Adhesives',
  'Tile and Flooring Accessories',
  'Polygranite Sheets',
];

export const NON_CORE_CATEGORIES = [
  'Plywood',
  'HDHMR',
  'Blockboard',
  'Doors',
  'Composite Board',
  'HDF',
  'Corian',
  'MDF',
];

export const SPECIAL_CATEGORIES = [
  'Wallpapers',
  'Quartz',
  'Laminate Wood Floor',
  'Installation',
  'Wall Cladding',
  'Veneers',
  'SPC Floor',
  'Solid Wood Floor',
  'ACP',
  'Vinyl Floor',
  'Wall Profile and Mouldings',
  'Edgebands',
  'Site Audit',
  'Hardware Accessories',
  'HPL Sheets',
  'Bathroom Accessories',
  'Profiles and Mouldings',
  'Marbles',
  'Films',
];

export const ORDER_STATUSES = new Set([
  'Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped',
  'Partly Delivered', 'Delivered',
]);

export const TARGETS_KEY = 'dashboard_category_targets';

export const SEGREGATION_ORDER = ['Core', 'Non-Core', 'Special', 'Unclassified'] as const;

export const SEGREGATION_ACCENT: Record<string, string> = {
  'Core': '#22C55E',
  'Non-Core': '#0EA5E9',
  'Special': '#8B5CF6',
  'Unclassified': '#94A3B8',
};

export const SEGREGATION_NOTE: Record<string, string> = {
  'Core': 'High-volume categories the stores are held to first.',
  'Non-Core': 'Thin-margin categories — watched, not pushed.',
  'Special': 'High-margin categories the segregation exists to grow.',
  'Unclassified': 'In the CRM but on none of the three segregation sheets.',
};

export const BUCKET_KEYS = ['total', 'core', 'nonCore', 'special'] as const;

export const BUCKET_LABEL: Record<string, string> = {
  total: 'Total Revenue', core: 'Core', nonCore: 'Non-Core', special: 'Special',
};

export const BUCKET_COLOR: Record<string, string> = {
  total: '#1A1A1A', core: '#22C55E', nonCore: '#0EA5E9', special: '#8B5CF6',
};

export const BUCKET_SEGREGATION: Record<string, string> = {
  core: 'Core', nonCore: 'Non-Core', special: 'Special',
};
