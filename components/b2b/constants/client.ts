import { SEGMENTS } from '../models/inboundModel';
import { ClientFieldSpec, ClientOrderMetrics, ClientStatus, DuplicateEvidence, MergeField } from '../types/client';

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

export const DEAL_ORDER_STATUSES = [
  'Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped',
  'Partly Delivered', 'Delivered',
] as const;

export const DEAL_LOST_STATUSES = [
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

export const EMPTY_ORDER_METRICS: ClientOrderMetrics = { dateState: 'pending' };

export const ACTIVE_WINDOW_MONTHS = 3;

export const CLIENT_STATUS_COLORS: Record<ClientStatus, string> = {
  Active:   '#22C55E',
  Inactive: '#9CA3AF',
  Unknown:  '#3B82F6',
};

export const CLIENT_STATUS_HINT: Record<ClientStatus, string> = {
  Active:   `Ordered within the last ${ACTIVE_WINDOW_MONTHS} months`,
  Inactive: `No order in the last ${ACTIVE_WINDOW_MONTHS} months`,
  Unknown:  'Order dates could not be read for this client',
};

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

export const CLIENT_FIELDS: ClientFieldSpec[] = [
  { key: 'company',    label: 'Company / business entity name', section: '3.1', owner: 'crm', input: 'text', onCreate: true, required: true },
  { key: 'contacts',   label: 'Contact numbers',                section: '3.1', owner: 'crm', input: 'contacts', onCreate: true, required: true, hint: 'One or more, each with a name and a label. Orders link to a client by these numbers.' },
  { key: 'gsts',       label: 'GST numbers',                    section: '3.1', owner: 'crm', input: 'gsts', onCreate: true, hint: 'Structure and check digit are validated here; the registered company name needs a GST Validator this stack does not have' },
  { key: 'segment',    label: 'Segment',                        section: '3.1', owner: 'crm', input: 'select', options: SEGMENTS, onCreate: true, required: true },
  { key: 'clientType', label: 'Client type',                    section: '6.1', owner: 'crm', input: 'select', options: CLIENT_ENTITY_TYPES, onCreate: true, required: true },
  { key: 'kam',        label: 'KAM',                            section: '3.2', owner: 'crm', input: 'select', hint: 'Assigned at the Inbound/Outreach handoff; reassignable, and every change is recorded' },
  { key: 'source',     label: 'Source',                         section: '2',   owner: 'crm', input: 'select', options: CLIENT_SOURCES },
  { key: 'remarks',    label: 'Remarks',                        section: '6.1', owner: 'crm', input: 'textarea' },

  { key: 'lastOrderPlaced',    label: 'Last order placed',     section: '2', owner: 'deals', input: 'readonly', hint: 'Most recent ordered ticket on any of this client’s numbers' },
  { key: 'orders',             label: 'Number of orders',      section: '2', owner: 'deals', input: 'readonly' },
  { key: 'totalRevenue',       label: 'Total revenue',         section: '2', owner: 'deals', input: 'readonly' },
  { key: 'averageOrderValue',  label: 'Average order value',   section: '2', owner: 'derived', input: 'readonly', hint: 'Total revenue ÷ number of orders' },
  { key: 'clientStatus',       label: 'Client status',         section: '2', owner: 'derived', input: 'readonly', hint: `Active = ordered within ${ACTIVE_WINDOW_MONTHS} months. System-computed; never set by hand.` },
];

export const CLIENT_FIELDS_BY_SECTION = (section: ClientFieldSpec['section']): ClientFieldSpec[] =>
  CLIENT_FIELDS.filter((f) => f.section === section);
