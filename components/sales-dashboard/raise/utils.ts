'use client';

import { Deal } from '@/lib/types';
import { EscSupportDeal } from './types';

export function isSalesDeal(deal: Deal) {
  return (deal.pipeline?.name ?? "").toLowerCase().includes("sales");
}

const CLOSED_STAGE_NAMES = new Set(["Ticket Cancelled", "Escalation Resolved"]);

export function extractEscSupport(deals: Deal[]): EscSupportDeal[] {
  const seen = new Set<number>();
  const out: EscSupportDeal[] = [];
  for (const d of deals) {
    const p = (d.pipeline?.name ?? "").toLowerCase();
    if (!p.includes("escalation") && !p.includes("support")) continue;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const cf = d.customFieldValues ?? {};
    const stage = d.pipelineStage?.name ?? "—";
    out.push({
      id: d.id,
      name: d.name,
      stage,
      pipeline: p.includes("escalation") ? "escalation" : "support",
      rca: cfDisplayValue(cf["cfRcaEscalationReason"]),
      resolution: cfDisplayValue(cf["cfResolution"]),
      closed: !!d.actualClosureDate
        || CLOSED_STAGE_NAMES.has(stage)
        || cfDisplayValue(cf["cfInstallationStatus"]) === "Resolution Completed",
      updatedAt: d.updatedAt ?? d.createdAt ?? null,
      reasonIds: (Array.isArray(cf["cfRaiseEscalation"]) ? cf["cfRaiseEscalation"] as { id?: number }[] : [])
        .map((r) => Number(r?.id))
        .filter((id) => !Number.isNaN(id)),
    });
  }
  return out;
}

export function formatCurrency(val: Deal["estimatedValue"]) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val.value);
}

export function cfDisplayValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val))
    return val.map((v) => (v as { name?: string })?.name ?? String(v)).join(", ");
  if (typeof val === "object" && (val as { name?: string }).name)
    return (val as { name: string }).name;
  return String(val);
}
