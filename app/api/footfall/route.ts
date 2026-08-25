import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Live walk-ins bucketed by IST date + 2-hour slot for a branch/date window.
// Reuses the existing Django `footfall-record/` list API (currently AllowAny) —
// we page through the branch/date-scoped records here and bucket into slots (the
// "frontend" does the bucketing). Always returns { buckets } so the UI degrades
// gracefully on any upstream issue.
// Same backend host the rest of the CRM talks to (lib/mockApi.ts).
const MD_API_BASE = "https://api-dev2.materialdepot.in/apiV1";

const SLOTS: { key: string; startH: number; endH: number }[] = [
  { key: "s1", startH: 10, endH: 12 },
  { key: "s2", startH: 12, endH: 14 },
  { key: "s3", startH: 14, endH: 16 },
  { key: "s4", startH: 16, endH: 18 },
  { key: "s5", startH: 18, endH: 20 },
  { key: "s6", startH: 20, endH: 21 },
];

// Extract IST calendar date (YYYY-MM-DD) + hour from a UTC timestamp.
const IST_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
function istParts(iso: string): { date: string; hour: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(IST_FMT.formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parseInt(parts.hour, 10) };
}
function slotKeyForHour(h: number): string | null {
  return SLOTS.find((s) => h >= s.startH && h < s.endH)?.key ?? null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  try {
    const buckets: Record<string, number> = {};
    let page = 1;
    while (page <= 50) {
      const url = new URL(`${MD_API_BASE}/footfall-record/`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", "10000");
      if (branch) url.searchParams.set("branch", branch);
      if (from) url.searchParams.set("from", from);
      if (to) url.searchParams.set("to", to);

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        return Response.json({ buckets, warning: `Footfall API returned ${res.status}` });
      }
      const data = (await res.json()) as {
        results?: Array<{ created_at?: string }>;
        next?: string | null;
      };
      const records = data.results ?? [];
      for (const r of records) {
        if (!r.created_at) continue;
        const p = istParts(r.created_at);
        if (!p) continue;
        const sk = slotKeyForHour(p.hour);
        if (!sk) continue;
        const key = `${p.date}|${sk}`;
        buckets[key] = (buckets[key] ?? 0) + 1;
      }
      if (!data.next) break;
      page++;
    }
    return Response.json({ buckets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Footfall fetch failed";
    return Response.json({ buckets: {}, error: message }, { status: 502 });
  }
}
