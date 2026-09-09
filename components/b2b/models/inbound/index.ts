export type { FieldOwner, InboundStatus, InboundLocation, Segment, ClientType, LeadType, Priority, Selection, CallAttemptOutcome, CallAttempt, PlacedUnder, FollowUpBucket } from '../../types/inbound';
export { OWNER_LABEL, OWNER_CHIP, INBOUND_STATUSES, INBOUND_STATUS_COLORS, INBOUND_STATUS_HINT, SEGMENTS, LEAD_TYPES, LEAD_TYPE_COLORS, PRIORITY_COLORS, SELECTIONS, PLACED_UNDER_FIELDS, FOLLOW_UP_LABEL, FOLLOW_UP_COLORS } from '../../constants/inbound';
export { decomposeLegacyStage, normalizeStatus, istToday, daysUntil, nameIsJustThePhone } from '../../utils/inbound';
export { locationFromPincode, clientTypeFromKylas, kylasClientTypeIsAmbiguous, selectionsToKylasLabels, selectionsFromKylasLabels, selectionsKylasWillDrop } from './kylas';
export { nextAttemptNumber, lastAttempt, hasConnected, retriesExhausted } from './calls';
export { statusGateErrors, callGateErrors, enrichmentGaps } from './gates';
export { followUpBucket, nextKamRoundRobin } from './followups';
