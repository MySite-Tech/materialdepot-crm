import { CallOutcome } from './types';
export const B2B_INBOUND_PIPELINE = 31627;

export const B2B_INBOUND_STAGES = [220515, 220290];

export const B2B_INBOUND_OWNERS: Record<number, string> = {
  81181: 'Hardi',
  73321: 'Mandeep',
};

export const B2B_INBOUND_OWNER_LIST: { id: number; name: string }[] =
  Object.entries(B2B_INBOUND_OWNERS).map(([id, name]) => ({ id: Number(id), name }));

export const B2B_INBOUND_FIELDS = [
  'firstName', 'lastName', 'ownerId', 'pipelineStage', 'phoneNumbers', 'zipcode',
  'actualClosureDate', 'source', 'createdAt', 'updatedAt', 'cfBranch',
  'cfSpaceRequirement', 'requirementName', 'city', 'expectedClosureOn',
  'cfCategoriesOfInterest', 'id', 'recordActions', 'customFieldValues',
  'companyZipcode', 'cfClientType', 'cfPsOwner', 'cfMissedCallCount', 'metaData',
];

export const KYLAS_CATEGORIES: { id: number; label: string }[] = [
  { id: 2689623, label: 'Tiles' },
  { id: 2689624, label: 'Panels' },
  { id: 2689625, label: 'Laminates' },
  { id: 2689626, label: 'Wallpapers' },
  { id: 2689627, label: 'Wooden Flooring' },
  { id: 2689628, label: 'Others' },
];

export const B2B_INBOUND_PAGE_SIZE = 25;

export const B2B_INBOUND_OWNER_IDS = Object.keys(B2B_INBOUND_OWNERS).map(Number);

export const CALL_OUTCOME_OPTIONS: { value: CallOutcome; label: string }[] = [
  { value: 'connected', label: 'Connected' },
  { value: 'busy', label: 'Busy' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'missed_call', label: 'Missed Call' },
];
