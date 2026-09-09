import { CLIENT_ENTITY_TYPES, ClientEntityType } from '../models/clientModel';
import { RowIssue, RowSeverity } from '../io/kamImport';
export const CLIENT_UPLOAD_COLUMNS = [
  'Company Name',
  'Contact Number',
  'Contact Name',
  'Contact Label',
  'GST Number',
  'Segment',
  'Client Type',
  'Merge With (Existing Company Name)',
  'Remarks',
] as const;

export const CLIENT_UPLOAD_MANDATORY: Record<string, boolean> = {
  'Company Name': true,
  'Contact Number': true,
  'Contact Name': true,
  'Contact Label': false,
  'GST Number': false,
  'Segment': true,
  'Client Type': true,
  'Merge With (Existing Company Name)': false,
  'Remarks': false,
};

export const CLIENT_UPLOAD_FORMAT: Record<string, string> = {
  'Company Name': 'Free text — the canonical business entity name',
  'Contact Number': '10-digit mobile number, no country code, no spaces or dashes',
  'Contact Name': 'Free text — the person tied to that contact number',
  'Contact Label': 'e.g. Owner, Accounts, Site Manager',
  'GST Number': '15-character alphanumeric GSTIN, standard format',
  'Segment': '1, 2 or 3 only',
  'Client Type': CLIENT_ENTITY_TYPES.join(' / '),
  'Merge With (Existing Company Name)': 'Exact existing Company Name this row should merge into',
  'Remarks': 'Free text',
};

export type { RowIssue, RowSeverity };

export const CLIENT_TYPE_ALIASES: Record<string, ClientEntityType> = {
  'architect': 'Architect',
  'interior designer': 'Interior Designer',
  'interior design': 'Interior Designer',
  'designer': 'Interior Designer',
  'contractor': 'Contractor',
  'builder': 'Builder',
  'end consumer': 'End Consumer',
  'home owner': 'End Consumer',
  'homeowner': 'End Consumer',
  'other': 'Other',
  'others': 'Other',
};

export const CLIENT_IMPORT_LOG_HEADERS = ['Row', 'Company', 'Result', 'Column', 'Message'];

export const TEMPLATE_EXAMPLE_ROWS: string[][] = [
  ['Metro Constructions', '9900099013', 'Rahul Nair', 'Owner', '27AAPFU0939F1ZV', '1', 'Contractor', '', 'Repeat client, orders monthly'],
  ['Metro Constructions', '9900099014', 'Priya Shah', 'Accounts', '', '1', 'Contractor', '', 'Second number on the same client'],
];
