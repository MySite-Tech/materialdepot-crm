import { DuplicateEvidence } from '../../../types/client';

export interface ParentSubject {
  id: string;
  company: string;
  contactPerson?: string;
  phones: string[];
  gsts: string[];
}

export type ParentNameSource = 'firm-suffix' | 'differs-from-contact' | 'most-frequent' | 'none';

export interface ParentCompany {
  id: string;
  name: string;
  nameFrom: ParentNameSource;
  memberIds: string[];
  names: string[];
  phones: string[];
  gsts: string[];
  pans: string[];
  linkedBy: DuplicateEvidence[];
}

export type NameOnlyVerdict = 'placeholder' | 'different-gsts' | 'person-like' | 'undecidable';

export interface NameOnlyCandidate {
  name: string;
  subjectCount: number;
  parentIds: string[];
  phoneCount: number;
  gstCount: number;
  contactPeople: number;
  readsAs: 'organisation' | 'individual' | 'placeholder';
  verdict: NameOnlyVerdict;
  reason: string;
}

export interface ParentGrouping {
  parents: ParentCompany[];
  nameOnly: NameOnlyCandidate[];
  unlinkable: string[];
}
