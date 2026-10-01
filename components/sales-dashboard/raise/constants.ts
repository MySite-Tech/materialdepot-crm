'use client';

export const PAGE_SIZE = 200;

export const DEFAULT_PAGE_SIZE = 10;

export const SYNC_INDEX_DELAY_MS = 5000;

// Raise confirmation poll: 5s x 36 = up to three minutes, for half the requests
// the old 2s x 30 spent. The clone is one Kylas create, but the task queues
// behind the integration's rate limiter: on 2026-09-16 a backlog took seven
// minutes to drain, the one-minute window expired, and operators resubmitted
// into three tickets for one issue.
export const RAISE_POLL_INTERVAL_MS = 5000;

export const RAISE_POLL_MAX_ATTEMPTS = 36;

export const SYNC_INDEX_MAX_ATTEMPTS = 10;

const SALES_PIPELINE_ID = 31661;

const ESCALATION_PIPELINE_ID = 32620;

const SUPPORT_PIPELINE_ID = 32616;

export const ESCALATION_PIPELINE_IDS = [ESCALATION_PIPELINE_ID, SUPPORT_PIPELINE_ID];

export const SALES_PIPELINE_RULE = {
  id: "pipeline", field: "pipeline", type: "string", input: "select",
  operator: "equal", value: SALES_PIPELINE_ID,
};

export const SEARCH_FIELDS = [
  "name", "ownedBy", "estimatedValue", "pipeline", "pipelineStage",
  "id", "createdAt", "updatedAt", "customFieldValues", "associatedContacts",
  "actualClosureDate",
];

// Escalations are about an order that exists, so the list asks Kylas for
// post-order deals only — filtering server-side keeps the page size and the
// pager honest, which a client-side filter cannot do.
//
// Expressed as the three PRE-order stages to exclude (New Deal, Availability
// Confirmed, Followup) rather than as an allowlist: that is how the same filter
// is written in Kylas's own UI, and it means a stage added to the pipeline
// later shows up here instead of silently disappearing.
const PRE_ORDER_STAGE_IDS = [220516, 227603, 220520];

export const POST_ORDER_STAGE_RULE = {
  id: "pipelineStage", field: "pipelineStage", type: "long",
  operator: "not_in", value: PRE_ORDER_STAGE_IDS,
  relatedFieldIds: ["pipeline"], relatedFieldValue: SALES_PIPELINE_ID,
};

export const RAISE_OPTIONS: { id: number; name: string; label?: string; requestType: "Support" | "Escalation" }[] = [
  { id: 202380, name: "Return", label: "Return Request", requestType: "Support" },
  { id: 184695, name: "Order Modification", label: "Order modification/cancellation", requestType: "Support" },
  { id: 202382, name: "Order Status Update", label: "Order status update", requestType: "Support" },
  { id: 202383, name: "Delivery Attempted", label: "Delivery attempted", requestType: "Support" },
  { id: 184504, name: "Delivery delay", label: "Delivery Delay", requestType: "Escalation" },
  { id: 212551, name: "Material not ready", requestType: "Escalation" },
  { id: 212558, name: "Batch/Shade Variation", label: "Batch/Shade variation", requestType: "Escalation" },
  { id: 184508, name: "Item missing", requestType: "Escalation" },
  { id: 202384, name: "Incorrect quantity received", requestType: "Escalation" },
  { id: 184507, name: "Wrong material", requestType: "Escalation" },
  { id: 184505, name: "Damaged material", label: "Damaged Material", requestType: "Escalation" },
  { id: 202385, name: "Unloading not done", requestType: "Escalation" },
  { id: 184506, name: "Quality Issue", label: "Quality issue", requestType: "Escalation" },
  { id: 202386, name: "Installation/Site Audit Issue", requestType: "Escalation" },
];
