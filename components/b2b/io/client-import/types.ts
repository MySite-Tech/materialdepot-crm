import { ClientContact, ClientEntity, ClientEntityType, ClientGst, Segment } from '../../models/client';
import { RowIssue, RowSeverity } from '../kam-import';
export interface ClientParsedRow {

  line: number;
  company: string;
  phone: string;
  gst: string;
  severity: RowSeverity;
  issues: RowIssue[];

  entityKey?: string;
  saveError?: string;
}

export type EntityAction = 'create' | 'update-existing' | 'merge-into';

export interface ClientImportEntity {
  key: string;
  company: string;
  action: EntityAction;

  existingId?: string;
  existingCompany?: string;

  matchedOn?: 'contact' | 'gst' | 'merge-with';
  contacts: ClientContact[];
  gsts: ClientGst[];
  segment?: Segment;
  clientType?: ClientEntityType;
  remarks?: string;
  lines: number[];

  client?: ClientEntity;
  saveError?: string;
}

export interface ClientImportResult {
  rows: ClientParsedRow[];
  entities: ClientImportEntity[];
  skipped: number;

  possibleDuplicates: { company: string; existingCompany: string; existingId: string }[];
}

export interface ClientImportSummary {
  rowsOk: number;
  rowsWarned: number;
  rowsRejected: number;
  skipped: number;
  entitiesCreate: number;
  entitiesUpdate: number;
  entitiesMerge: number;
  entitiesFailed: number;
  possibleDuplicates: number;
}

export interface TemplateSheet {
  name: string;
  rows: (string | number)[][];
  colWidths?: number[];
}
