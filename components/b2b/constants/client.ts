
import { ClientStatus, DuplicateEvidence, MergeField, StatusScale, StudioAccess } from '../types/client';

export const CLIENT_ENTITY_TYPES = [
  'Architect', 'Interior Designer', 'Contractor', 'Builder', 'End Consumer', 'Other',
] as const;

export const CLIENT_SOURCES = ['Inbound', 'Outreach', 'Existing'] as const;

export const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

export const GST_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const GST_STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

const DEAL_ORDER_STATUSES = [
  'Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped',
  'Partly Delivered', 'Delivered',
] as const;

const DEAL_LOST_STATUSES = [
  'Order Lost', 'Order Cancelled', 'Refunded',
] as const;

export const ORDER_SET = new Set<string>(DEAL_ORDER_STATUSES);

export const LOST_SET = new Set<string>(DEAL_LOST_STATUSES);

export const INTERACTION_TYPES = ['Call', 'Meeting'] as const;

export const TEMPERATURE_MIN = 0;

export const TEMPERATURE_MAX = 10;

export const TEMPERATURE_BANDS = [
  { key: 'cold',  label: '0–3 · at risk',  min: 0, max: 3,  color: '#EF4444' },
  { key: 'warm',  label: '4–6 · watch',    min: 4, max: 6,  color: '#F59E0B' },
  { key: 'hot',   label: '7–10 · healthy', min: 7, max: 10, color: '#22C55E' },
] as const;

export const ACTIVE_DAYS = 30;

export const INACTIVE_DAYS = 60;

export const CLIENT_STATUS_SCALE: StatusScale & { colors: Record<ClientStatus, string> } = {
  colors: { Active: '#22C55E', 'Inactive 1 month': '#F59E0B', Inactive: '#9CA3AF', Unknown: '#3B82F6' },
  hint: {
    Active: `Ordered within the last ${ACTIVE_DAYS} days`,
    'Inactive 1 month': `Last order ${ACTIVE_DAYS + 1}–${INACTIVE_DAYS} days ago`,
    Inactive: `No order in the last ${INACTIVE_DAYS} days`,
    Unknown: 'Order dates could not be read for this client',
  },
};

export const STUDIO_SPACE_URL = 'https://studio.materialdepot.com';

export const STUDIO_ACCESS: Record<StudioAccess, { label: string; hint: string }> = {
  power:       { label: 'Power user',     hint: 'Sees the whole Studio Space dashboard' },
  'non-power': { label: 'Non-power user', hint: 'Sees only the Orders and Rewards tabs' },
};

export const CONTACT_CLASSES = ['Owner', 'Partner', 'Designer', 'Purchase', 'Accounts', 'Site'] as const;

export const EVIDENCE_LABEL: Record<DuplicateEvidence, string> = {
  contact: 'Same contact number',
  gst:     'Same GST number',
  pan:     'Same PAN inside two GSTs',
  name:    'Similar company name',
};

export const EVIDENCE_IS_EXACT: Record<DuplicateEvidence, boolean> = {
  contact: true, gst: true, pan: true, name: false,
};

export const MERGE_FIELD_LABEL: Record<MergeField, string> = {
  company:    'Company name',
  segment:    'Segment',
  clientType: 'Client type',
  kam:        'KAM',
  source:     'Source',
};

export const MERGE_FIELDS: MergeField[] = ['company', 'segment', 'clientType', 'kam', 'source'];
