export type { FieldOwner, InboundStatus, InboundLocation, Segment, ClientType, LeadType, Priority, Selection, CallAttemptOutcome, CallAttempt, PlacedUnder, FollowUpBucket, OutreachReferral, ContactPerson, ClosureReadiness, ClosureReason } from '../../types/inbound';
export { OWNER_LABEL, OWNER_CHIP, INBOUND_STATUSES, INBOUND_STATUS_COLORS, INBOUND_STATUS_HINT, INBOUND_NURTURE_STATUS, INBOUND_FOLLOW_UP_STATUSES, INBOUND_OPEN_STATUSES, INBOUND_CLOSED_STATUSES, isFollowUpStatus, isOpenStatus, SEGMENTS, LEAD_TYPES, LEAD_TYPE_COLORS, PRIORITY_COLORS, SELECTIONS, PLACED_UNDER_FIELDS, PLACED_UNDER_TITLE, PLACED_UNDER_SUBTITLE, FOLLOW_UP_LABEL, FOLLOW_UP_COLORS } from '../../constants/inbound';
export { decomposeLegacyStage, normalizeStatus, istToday, daysUntil, nameIsJustThePhone, addDays, nextWorkingDay, inboundWorkDay } from '../../utils/inbound';
export { locationFromPincode, clientTypeFromKylas, kylasClientTypeIsAmbiguous, selectionsToKylasLabels, selectionsFromKylasLabels, selectionsKylasWillDrop } from './kylas';
export { nextAttemptNumber, lastAttempt, hasConnected, callTally, closureReadiness } from './calls';
export { statusGateErrors, connectedCallErrors, enrichmentGaps } from './gates';
export { followUpBucket, nextKamRoundRobin, istDay, hasPi, piDay, lastCallDay, sentToOutreach, withStatusStamps, clientSpocs } from './lifecycle';
export type { Spoc, ClientSpocs } from './lifecycle';
