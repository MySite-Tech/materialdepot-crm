import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Confirms an OMS SERVICE leg was performed — the site audit happened, the installation happened.
// That confirmation is what raises the service invoice in Zoho (a service has no dispatch, so it IS
// the billing trigger), which is why the CRM must send it when a job is marked complete.
//
// Proxies to the Django `ServicePerformedView` (oms/api/views/stages.py), which requires
// IsInternalOrgUser — the caller's CRM token is forwarded straight through, same as ../install-pos.
// Idempotent upstream: confirming twice records nothing new and cannot double-bill.
// Same backend host the rest of the CRM talks to (lib/mockApi.ts).
const MD_API_BASE = "https://api-dev2.materialdepot.in/apiV1";

// The synthetic PO number the site-audit PO list hands out for an OMS service leg, e.g.
// "SO417-S2562" → stage 2562. Legacy PO numbers ("MD8202681094") carry no leg and are skipped.
const STAGE_REF = /^SO(\d+)-S(\d+)$/;

export function stageIdFrom(po: unknown): number | null {
  const candidates = Array.isArray(po) ? po : typeof po === "string" ? po.split(",") : [];
  for (const raw of candidates) {
    const m = STAGE_REF.exec(String(raw).trim());
    if (m) return Number(m[2]);
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const stageId = Number(body?.stage_id) || stageIdFrom(body?.po);
  if (!stageId) {
    // Not an OMS job (a legacy PO, or a manually added order with no PO): nothing to confirm.
    return Response.json({ ok: true, skipped: "no OMS service leg on this order" });
  }

  const authHeader = request.headers.get("authorization");
  try {
    const res = await fetch(`${MD_API_BASE}/oms/stages/${stageId}/service-performed/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ notes: String(body?.notes || "").slice(0, 500) }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return Response.json(
        { ok: false, stage_id: stageId, error: (data && data.detail) || `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    return Response.json({ ok: true, stage_id: stageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "confirmation failed";
    return Response.json({ ok: false, stage_id: stageId, error: message }, { status: 502 });
  }
}
