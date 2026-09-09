export type { KamOrderStatus, KamOrder, CallCompliance, CadenceRow, AssignedClientRow, KamPipelineSplit, KamFunnel, CohortMonth, KamAccountSplit, NewVsRepeat, KamView } from '../types/kam';
export { KAM_ORDER_STATUSES, KAM_ORDER_STATUS_COLORS, KAM_ORDER_STATUS_HINT, KAM_OPEN_STATUSES, KAM_PIPELINE_STATUSES, KAM_ORDER_LOST_REASONS, DAILY_CALL_TARGET, KAM_VIEWS } from '../constants/kam';
export { normalizeKamOrderStatus, isLegacyKamStage, queueAgeBand } from '../utils/kam';
export { kamOrderGateErrors, kamOrderStatusPrompts, interactionGateErrors, interactionPrompts } from './kam/gates';
export { callsLoggedOn, callCompliance, todaysCalls, followUpQueue, assignedClientRows, temperatureMismatch, isAtRisk } from './kam/cadence';
export { kamPipeline, kamPipelineToday, kamFunnel, clientCohort, kamAccountSplit, lostReasonBreakdown, newVsRepeat, segmentRevenue } from './kam/analytics';
export { SEGMENTS } from './inboundModel';
export { dealIsOrder } from './clientModel';
