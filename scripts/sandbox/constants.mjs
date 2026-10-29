export const SYNC_KEY = 'sandbox';

export const STATE_FILE = '.sandbox/state.json';

export const INBOUND_PIPELINE = 31627;

export const STAGE_QUALIFIED = 220515;

export const STAGE_WON = 220290;

export const INTAKE_KYLAS_ID = 81181;

export const PERSONAS = [
  { phone: '9000000001', userId: 910001, name: 'Asha (Inbound)', role: 'b2b_sales', team: 'inbound', kylasId: 990001 },
  { phone: '9000000002', userId: 910002, name: 'Bharat (Inbound)', role: 'b2b_sales', team: 'inbound', kylasId: 990002 },
  { phone: '9000000011', userId: 910011, name: 'Omkar (Outreach)', role: 'b2b_sales', team: 'outreach' },
  { phone: '9000000021', userId: 910021, name: 'Kavya (KAM)', role: 'b2b_KAM', team: 'kam' },
  { phone: '9000000099', userId: 910099, name: 'Meera (B2B Manager)', role: 'b2b_manager' },
];

export const EC_BMS = [
  { phone: '9000000031', userId: 910031, name: 'Ravi (EC BM)', role: 'sales', branches: ['JP Nagar'] },
  { phone: '9000000032', userId: 910032, name: 'Sneha (EC BM)', role: 'sales', branches: ['Whitefield'] },
  { phone: '9000000033', userId: 910033, name: 'Imran (EC BM)', role: 'sales', branches: ['HSR'] },
];

export const BRANCHES = [
  { id: 1, branch_name: 'JP Nagar' },
  { id: 2, branch_name: 'Whitefield' },
  { id: 3, branch_name: 'HSR' },
  { id: 4, branch_name: 'Gachibowli' },
];

export const KYLAS_USERS = [
  { id: INTAKE_KYLAS_ID, name: 'Hardi', phone: '9000000081', active: true },
  ...PERSONAS.filter((p) => p.kylasId).map((p) => ({ id: p.kylasId, name: p.name, phone: p.phone, active: true })),
  { id: 990009, name: 'Presales Demo', phone: '9000000091', active: true },
];

export const KYLAS_API_USER = 'CRM integration (sandbox)';

export const PRESALES = 'Presales Demo';

export const DEAL_ORDER_STATUSES = ['Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped', 'Partly Delivered', 'Delivered'];

export const DEAL_LOST_STATUSES = ['Order Lost', 'Order Cancelled', 'Refunded'];

export const KYLAS_CATEGORY = { Tiles: 2689623, Panels: 2689624, Laminates: 2689625, Wallpaper: 2689626, Flooring: 2689627, Others: 2689628 };
