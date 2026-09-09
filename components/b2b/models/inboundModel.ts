export type { FieldOwner, InboundStatus, LegacyStage, InboundLocation, Segment, ClientType, LeadType, Priority, Selection, CallAttemptOutcome, CallAttempt, PlacedUnder, StatusGateInput, EnrichmentInput, EnrichmentGap, FollowUpBucket, FieldInput, InboundFieldSpec } from '../types/inbound';
export { OWNER_LABEL, OWNER_CHIP, INBOUND_STATUSES, INBOUND_STATUS_COLORS, INBOUND_STATUS_HINT, INVALID_ENQUIRY_REASON, INBOUND_LOCATIONS, SEGMENTS, CLIENT_TYPES, LEAD_TYPES, LEAD_TYPE_COLORS, PRIORITIES, PRIORITY_COLORS, SELECTIONS, MAX_CALL_ATTEMPTS, PLACED_UNDER_FIELDS, ENRICHMENT_FIELD_COUNT, FOLLOW_UP_LABEL, FOLLOW_UP_COLORS, INBOUND_FIELDS, FIELDS_BY_SECTION, INBOUND_LOST_REASONS } from '../constants/inbound';
export { decomposeLegacyStage, normalizeStatus, istToday, daysUntil, nameIsJustThePhone } from '../utils/inbound';
export { locationFromPincode, clientTypeFromKylas, kylasClientTypeIsAmbiguous, selectionsToKylasLabels, selectionsFromKylasLabels, selectionsKylasWillDrop } from './inbound/kylas';
export { nextAttemptNumber, lastAttempt, hasConnected, retriesExhausted } from './inbound/calls';
export { statusGateErrors, callGateErrors, enrichmentGaps } from './inbound/gates';
export { followUpBucket, nextKamRoundRobin } from './inbound/followups';
