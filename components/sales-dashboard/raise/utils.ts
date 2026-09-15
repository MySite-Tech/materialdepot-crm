'use client';

import { Deal } from '@/lib/types';

export function isSalesDeal(deal: Deal) {
  return (deal.pipeline?.name ?? "").toLowerCase().includes("sales");
}

export function extractEscSupport(deals: Deal[]) {
  const seen = new Set<number>();
  const out: { id: number; name: string; stage: string; pipeline: string }[] = [];
  for (const d of deals) {
    const p = (d.pipeline?.name ?? "").toLowerCase();
    if (!p.includes("escalation") && !p.includes("support")) continue;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({
      id: d.id,
      name: d.name,
      stage: d.pipelineStage?.name ?? "—",
      pipeline: p.includes("escalation") ? "escalation" : "support",
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
