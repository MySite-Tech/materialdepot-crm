
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

export const INTERACTION_TYPES = ['Call', 'Meeting', 'Enquiry'] as const;

export const INTERACTION_SUMMARY: Record<typeof INTERACTION_TYPES[number], { label: string; placeholder: string }> = {
  Call:    { label: 'Summary',               placeholder: 'What was discussed' },
  Meeting: { label: 'Minutes of meeting *',  placeholder: 'Who was there, what was discussed, what was agreed' },
  Enquiry: { label: 'What they asked for *', placeholder: 'Products, quantities, site, by when' },
};

export const TEMPERATURE_MIN = 0;

export const TEMPERATURE_MAX = 10;

export const TEMPERATURE_BANDS = [
  { key: 'cold',  label: '0–3 · at risk',  min: 0, max: 3,  color: '#EF4444' },
  { key: 'warm',  label: '4–6 · watch',    min: 4, max: 6,  color: '#F59E0B' },
  { key: 'hot',   label: '7–10 · healthy', min: 7, max: 10, color: '#22C55E' },
] as const;

export const ORDER_BANDS: { status: ClientStatus; upTo: number }[] = [
  { status: 'Active', upTo: 1 },
  { status: 'Inactive 2–3 months', upTo: 3 },
  { status: 'Inactive 4–6 months', upTo: 6 },
  { status: 'Inactive 7–12 months', upTo: 12 },
];

export const LONG_INACTIVE: ClientStatus[] = ['Inactive 4–6 months', 'Inactive 7–12 months', 'Inactive over 12 months'];

export const CLIENT_STATUS_SCALE: StatusScale & { colors: Record<ClientStatus, string> } = {
  colors: {
    Active: '#22C55E',
    'Inactive 2–3 months': '#F59E0B',
    'Inactive 4–6 months': '#9CA3AF',
    'Inactive 7–12 months': '#6B7280',
    'Inactive over 12 months': '#374151',
    'Never ordered': '#D1D5DB',
    Unknown: '#3B82F6',
  },
  hint: {
    Active: 'Ordered this calendar month or last (M-0 or M-1)',
    'Inactive 2–3 months': 'Last order two or three calendar months back (M-2 or M-3)',
    'Inactive 4–6 months': 'Last order four to six calendar months back (M-4 to M-6)',
    'Inactive 7–12 months': 'Last order seven to twelve calendar months back (M-7 to M-12)',
    'Inactive over 12 months': 'Last order more than twelve calendar months back',
    'Never ordered': 'No order on record for any of the firm’s numbers',
    Unknown: 'Order dates could not be read, or the last order date is after today',
  },
};

export const STUDIO_SPACE_URL = 'https://studio.materialdepot.com';

export const STUDIO_ACCESS: Record<StudioAccess, { label: string; hint: string }> = {
  power:       { label: 'Power user',  hint: 'Every Studio Space tab: projects, moodboards, inspiration, Discovery Lab, leads, orders and rewards' },
  'non-power': { label: 'Normal user', hint: 'Orders, clients and rewards on Studio Space; Power tabs are locked until their KAM upgrades them' },
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
