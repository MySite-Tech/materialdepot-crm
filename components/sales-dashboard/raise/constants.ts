'use client';

export const PAGE_SIZE = 200;

export const DEFAULT_PAGE_SIZE = 10;

export const SYNC_INDEX_DELAY_MS = 5000;

export const SYNC_INDEX_MAX_ATTEMPTS = 10;

const SALES_PIPELINE_ID = 31661;

export const SALES_PIPELINE_RULE = {
  id: "pipeline", field: "pipeline", type: "string", input: "select",
  operator: "equal", value: SALES_PIPELINE_ID,
};

export const SEARCH_FIELDS = [
  "name", "ownedBy", "estimatedValue", "pipeline", "pipelineStage",
  "id", "createdAt", "updatedAt", "customFieldValues", "associatedContacts",
];

export const RAISE_OPTIONS: { id: number; name: string; label?: string; requestType: "Support" | "Escalation" }[] = [
  { id: 202380, name: "Return", label: "Return Request", requestType: "Support" },
  { id: 184695, name: "Order Modification", label: "Modify Order", requestType: "Support" },
  { id: 202382, name: "Order Status Update", label: "Order status update", requestType: "Support" },
  { id: 184512, name: "Other disputes", label: "Others", requestType: "Support" },
  { id: 184504, name: "Delivery delay", label: "Delivery Delay", requestType: "Escalation" },
  { id: 184508, name: "Item missing", requestType: "Escalation" },
  { id: 202384, name: "Incorrect quantity received", requestType: "Escalation" },
  { id: 184507, name: "Wrong material", requestType: "Escalation" },
  { id: 184505, name: "Damaged material", label: "Damaged Material", requestType: "Escalation" },
  { id: 202385, name: "Unloading not done", requestType: "Escalation" },
  { id: 184506, name: "Quality Issue", label: "Quality issue", requestType: "Escalation" },
  { id: 202386, name: "Installation/Site Audit Issue", requestType: "Escalation" },
];
