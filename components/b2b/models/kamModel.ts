export type { KamOrderStatus, KamOrder, KamOrderGateInput, InteractionGateInput, CallCompliance, CadenceRow, AssignedClientRow, TemperatureMismatch, KamPipelineSplit, KamFunnel, CohortMonth, KamAccountSplit, NewVsRepeat, KamView, KamFieldInput, KamFieldSpec } from '../types/kam';
export { KAM_ORDER_STATUSES, KAM_ORDER_STATUS_COLORS, KAM_ORDER_STATUS_HINT, KAM_OPEN_STATUSES, KAM_PIPELINE_STATUSES, KAM_ORDER_LOST_REASONS, DAILY_CALL_TARGET, QUEUE_AGE_BANDS, TEMPERATURE_SILENCE_DAYS, AT_RISK_WINDOW_DAYS, EMPTY_SPLIT, KAM_VIEWS, KAM_ORDER_FIELDS, KAM_INTERACTION_FIELDS } from '../constants/kam';
export { normalizeKamOrderStatus, isLegacyKamStage, queueAgeBand, contactNumbersForOrder } from '../utils/kam';
export { kamOrderGateErrors, kamOrderStatusPrompts, interactionGateErrors, interactionPrompts } from './kam/gates';
export { callsLoggedOn, callCompliance, todaysCalls, followUpQueue, assignedClientRows, temperatureMismatch, isAtRisk } from './kam/cadence';
export { kamPipeline, kamPipelineToday, kamFunnel, clientCohort, kamAccountSplit, lostReasonBreakdown, newVsRepeat, segmentRevenue } from './kam/analytics';
export type { Segment, FieldOwner, FollowUpBucket } from './inboundModel';
export { SEGMENTS, istToday, followUpBucket, daysUntil } from './inboundModel';
export { dealIsOrder, dealIsLost, dealIsOpen } from './clientModel';
