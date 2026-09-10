import type { ChecklistSection, ChecklistValue } from './types';

export const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    key: 'opening',
    label: 'EC Opening Checklist',
    when: 'Before the store opens',
    items: [
      { id: 'op_back_door', label: 'Back Door Lock Check & Open' },
      { id: 'op_front_door', label: 'Front Door Lock Check & Open' },
      { id: 'op_lights_facade', label: 'Lights on & Switch On Facade' },
      { id: 'op_music', label: 'Music On' },
      { id: 'op_electric_room', label: 'Electric Room Door Close Always' },
      { id: 'op_edc_laptops', label: 'EDC Charged & Laptops Charged' },
      { id: 'op_tv', label: 'TV On' },
      { id: 'op_client_tables', label: 'Client Tables cleaned' },
      { id: 'op_lobby_clear', label: 'Reception/Lobby free of Unwanted material' },
      { id: 'op_pantry_refill', label: 'Refill of Pantry Items if needed / Tea Machine' },
      { id: 'op_tiles_refilled', label: 'Tiles refilled back to panels' },
      { id: 'op_panels_merchandise', label: 'All Panels are filled with Merchandise' },
      { id: 'op_catalogue_racks', label: 'Catalogue properly Kept in racks' },
      { id: 'op_broken_check', label: 'Broken Tiles/Panels/Laminates Check' },
      { id: 'op_qr_codes', label: 'All merchandise has QR Codes' },
      { id: 'op_ply_liner', label: 'PLY & Liner laminates Sample arranged' },
      { id: 'op_quartz', label: 'Quartz Display arranged' },
      { id: 'op_chairs', label: 'All Chairs Organised' },
    ],
  },
  {
    key: 'hk',
    label: 'HK Staff Checklist',
    when: 'Housekeeping, through the day',
    items: [
      { id: 'hk_groomed', label: 'All HK Staff groomed & in Uniform' },
      { id: 'hk_mop', label: 'Dry Mop & Wet Mop' },
      { id: 'hk_mop_2h', label: 'Dry Mop every 2 hours' },
      { id: 'hk_panels_dusting', label: 'Panels dusting' },
      { id: 'hk_washroom', label: 'Wash room cleaning' },
      { id: 'hk_pantry_vending', label: 'Pantry & Vending Machine cleaning' },
      { id: 'hk_dustbin', label: 'Dustbin cleared on time' },
      { id: 'hk_glass', label: 'Window & Glass door clean (Colin & Newspaper only)' },
      { id: 'hk_parking', label: 'Parking Area clean' },
      { id: 'hk_back_door_area', label: 'Back door area clean' },
    ],
  },
  {
    key: 'working',
    label: 'Working Hours Checklist',
    when: 'While the store is open',
    items: [
      { id: 'wk_hk_per_table', label: 'HK staff assigned to each table' },
      { id: 'wk_ac_interval', label: 'AC Switch Off in Interval' },
      { id: 'wk_table_cleaning', label: 'Periodic Cleaning of Tables done' },
      { id: 'wk_welcome_beverage', label: 'Welcome beverage provided to Clients' },
    ],
  },
  {
    key: 'closing',
    label: 'EC Closing Checklist',
    when: 'At close',
    items: [
      { id: 'cl_merch_refill', label: 'Refill of all Merchandise done' },
      { id: 'cl_electricals_off', label: 'All electricals and other units turned off' },
      { id: 'cl_closing_update', label: 'Store Closing Updates Posted in group' },
      { id: 'cl_devices_locked', label: 'All laptops and Tabs kept in the drawer and locked' },
      { id: 'cl_cash_drawer', label: 'Cash drawer locked' },
    ],
  },
];

export const CHECKLIST_VALUES: Array<{ value: ChecklistValue; label: string }> = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'NA' },
];

export const MARKER_ROLES = new Set(['retail', 'store_manager', 'manager', 'admin', 'tech', 'superadmin']);

export const OVERSIGHT_ROLES = new Set(['store_manager', 'manager', 'admin', 'tech', 'superadmin']);

export const ALL_STORE_ROLES = new Set(['manager', 'admin', 'tech', 'superadmin']);

export const BACKDATE_DAYS: Record<string, number> = {
  retail: 0,
  store_manager: 6,
  manager: 6,
  admin: 30,
  tech: 30,
  superadmin: 30,
};

export const DEFAULT_BACKDATE_DAYS = 0;

export const HISTORY_DAYS = 14;

export const BRANCH_NAME_TO_STORE_CODE: Record<string, string> = {
  jpnagar: 'JP_ec',
  jp: 'JP_ec',
  yelahanka: 'YE_ec',
  yelankha: 'YE_ec',
  yelanka: 'YE_ec',
  ylk: 'YE_ec',
  whitefield: 'WF_ec',
  wf: 'WF_ec',
  kompally: 'KP_ec',
  hsr: 'HSR_ec',
  hsrlayout: 'HSR_ec',
  gachibowli: 'GB_ec',
  basaveshwarnagar: 'BN_ec',
  basaveshwaranagar: 'BN_ec',
  basaveshwaranagara: 'BN_ec',
};
