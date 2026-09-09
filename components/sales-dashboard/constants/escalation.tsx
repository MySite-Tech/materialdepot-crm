'use client';

import { DateFilter, TimelineEntry } from '../types/escalation';

export const PAGE_SIZE = 20;

export const SEARCH_FIELDS = [
  "name",
  "ownedBy",
  "estimatedValue",
  "pipeline",
  "pipelineStage",
  "id",
  "createdAt",
  "updatedAt",
  "customFieldValues",
  "associatedContacts",
];

const ESCALATION_PIPELINE_ID = 32620;

const SUPPORT_PIPELINE_ID = 32616;

export const ESC_SUPPORT_PIPELINE_RULE = {
  id: "pipeline", field: "pipeline", type: "string", input: "select",
  operator: "in", value: [ESCALATION_PIPELINE_ID, SUPPORT_PIPELINE_ID],
};

export const TRACKED_FIELDS: Record<string, string> = {
  cfResolution: "Resolution",
  cfRefundCnAmount: "Refund/CN Value",
  cfEscalationClassification: "Attribution",
};

export const TIMELINE_ICONS: Record<TimelineEntry["icon"], { bg: string; symbol: string }> = {
  create: { bg: "bg-blue-500", symbol: "+" },
  stage: { bg: "bg-indigo-500", symbol: "\u2192" },
  update: { bg: "bg-yellow-500", symbol: "\u270e" },
  note: { bg: "bg-green-500", symbol: "\u2709" },
  call: { bg: "bg-purple-500", symbol: "\u2706" },
  close: { bg: "bg-gray-500", symbol: "\u00d7" },
};

export const DATE_CHIPS: { value: DateFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "7 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];
