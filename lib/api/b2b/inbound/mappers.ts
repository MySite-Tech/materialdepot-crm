import { B2B_INBOUND_FIELDS, B2B_INBOUND_OWNERS, B2B_INBOUND_PIPELINE, B2B_INBOUND_STAGES } from './constants';
import { KylasIdentity } from './types';
import { categoryLabelsFromIds, cf, cfCount, cfString, kylasIdName } from './utils';
import { selectionsFromKylasLabels } from '@/components/b2b/models/inbound';
function mapInboundSource(raw: unknown): import('../../../../components/b2b/models/mock-data').InboundLead['source'] {
  const name = (typeof raw === 'object' && raw ? (raw as { name?: string }).name || '' : String(raw || '')).toLowerCase();
  if (name.includes('whatsapp')) return 'WhatsApp';
  if (name.includes('referral')) return 'Referral';
  if (name.includes('walk')) return 'Walk-in';
  if (name.includes('google')) return 'Google';
  if (name.includes('web') || name.includes('form')) return 'Website form';
  return 'Other';
}

export function kylasLeadIdentity(raw: Record<string, any>): KylasIdentity {
  const first = String(raw.firstName ?? '').trim();
  const last = String(raw.lastName ?? '').trim();
  const pn = Array.isArray(raw.phoneNumbers) && raw.phoneNumbers.length ? raw.phoneNumbers[0] : null;
  const phone = pn ? String(pn.value || pn.dialCode || '').trim() : '';
  const displayName = [first, last].filter(Boolean).join(' ');
  const digits = (v: string) => v.replace(/\D/g, '').slice(-10);
  const nameIsPhone = !!displayName && !!phone && digits(displayName) === digits(phone);
  return { phone, contactName: nameIsPhone ? '' : displayName, displayName };
}

export function mapInboundLead(raw: Record<string, any>): import('../../../../components/b2b/models/mock-data').InboundLead {
  const { phone, contactName, displayName } = kylasLeadIdentity(raw);
  const kylasStage = typeof raw.pipelineStage === 'object' ? raw.pipelineStage?.id : raw.pipelineStage;

  const urgency = cfString(raw, 'city');
  const sourceName = kylasIdName(raw, 'source', raw.source);
  return {
    id: String(raw.id),
    phone,

    contactName,
    owner: B2B_INBOUND_OWNERS[raw.ownerId] || 'Unassigned',
    ownerId: typeof raw.ownerId === 'number' ? raw.ownerId : undefined,
    leadCreatedAt: raw.createdAt ? String(raw.createdAt) : undefined,
    qualificationTag: cfString(raw, 'companyZipcode'),
    presalesOwner: cfString(raw, 'cfPsOwner'),
    leadSummary: cfString(raw, 'cfSpaceRequirement'),
    urgency,
    pincode: cfString(raw, 'zipcode'),
    presalesClientType: cfString(raw, 'cfClientType'),
    presalesMissedCalls: cfCount(raw, 'cfMissedCallCount'),
    kylasStage: typeof kylasStage === 'number' ? kylasStage : undefined,
    source: mapInboundSource(sourceName ?? raw.source),

    stage: 'New',

    company: displayName || `Lead ${raw.id}`,
    value: 0,

    requirement: cfString(raw, 'requirementName'),
    selections: selectionsFromKylasLabels(
      categoryLabelsFromIds(cf(raw, 'cfCategoriesOfInterest')),
    ),

    timeline: urgency,
    requirementBrief: cfString(raw, 'cfSpaceRequirement'),
    categories: categoryLabelsFromIds(cf(raw, 'cfCategoriesOfInterest')),

    calls: [],
    notes: [],
  };
}

export function b2bInboundRule(
  ownerIds: number[],
  search?: string,
  createdAfter?: string,
  createdBefore?: string,
  kylasStage?: number,
) {
  const ownerRule = ownerIds.length === 1
    ? { operator: 'equal', id: 'ownerId', field: 'ownerId', type: 'long', value: ownerIds[0], relatedFieldIds: null }
    : { operator: 'in', id: 'ownerId', field: 'ownerId', type: 'long', value: ownerIds, relatedFieldIds: null };

  const stageRule = kylasStage
    ? { operator: 'equal', id: 'pipelineStage', field: 'pipelineStage', type: 'long', value: kylasStage, relatedFieldIds: ['pipeline'] }
    : { operator: 'in', id: 'pipelineStage', field: 'pipelineStage', type: 'long', value: B2B_INBOUND_STAGES, relatedFieldIds: ['pipeline'] };
  const rules: Record<string, any>[] = [
    ownerRule,
    { operator: 'equal', id: 'pipeline', field: 'pipeline', type: 'long', value: B2B_INBOUND_PIPELINE, dependentFieldIds: ['pipelineStage', 'pipelineStageReason'] },
    stageRule,
  ];
  const q = (search || '').trim();
  if (q) {
    rules.push({ id: 'multi_field', field: 'multi_field', type: 'multi_field', input: 'multi_field', operator: 'multi_field', value: q });
  }
  if (createdAfter && createdBefore) {
    rules.push({
      operator: 'between', id: 'createdAt', field: 'createdAt', type: 'date',
      value: [createdAfter, createdBefore], relatedFieldIds: null, timeZone: 'Asia/Calcutta',
    });
  } else if (createdAfter) {
    rules.push({
      operator: 'greater', id: 'createdAt', field: 'createdAt', type: 'date',
      value: createdAfter, relatedFieldIds: null, timeZone: 'Asia/Calcutta',
    });
  } else if (createdBefore) {
    rules.push({
      operator: 'less', id: 'createdAt', field: 'createdAt', type: 'date',
      value: createdBefore, relatedFieldIds: null, timeZone: 'Asia/Calcutta',
    });
  }
  return {
    fields: B2B_INBOUND_FIELDS,
    jsonRule: { rules, condition: 'AND', valid: true },
  };
}
