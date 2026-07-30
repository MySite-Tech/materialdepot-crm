import type { NextRequest } from "next/server";
import { getCached, setCache } from "@/lib/cache";
import { rateLimitedFetch } from "@/lib/rateLimiter";

export const dynamic = "force-dynamic";

const KYLAS_API_BASE =
  process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";

// Appointment feed for the Appointment Tracker.
//
// Why this exists: the tracker used to page through /api/leads/search from the
// browser — 25 requests at size=100 for ~2.5k EC leads — and every client did
// its own sweep, re-running it on each branch/date change. This route does the
// sweep once on the server at the largest page size Kylas accepts (1000, so 3
// requests) and caches the assembled list, so all users and tabs share it.
//
// Kylas' jsonRule filter can't query values inside `customFieldValues` (custom
// date fields silently return zero rows), so we scope by `companyBusinessType`
// — the branch enum, which IS queryable — and drop leads with no visit date
// here. Callers slice by branch and date window themselves.
const BRANCH_ENUM_VALUES = [
  "JP_NAGAR_EC",
  "YELAHANKA_EC",
  "WHITEFIELD_EC",
  "GACHIBOWLI_EC",
  "KOMPALLY_EC",
  "HSR_EC",
];

// Only what the tracker actually renders. `customFieldValues` is requested for
// cfVisitScheduled alone, and is dropped from the response after hoisting it.
const FIELDS = [
  "id",
  "firstName",
  "lastName",
  "phoneNumbers",
  "requirementName",
  "companyBusinessType",
  "companyWebsite",
  "customFieldValues",
  "convertedAt",
];

const PAGE_SIZE = 1000;   // Kylas' effective ceiling — 2.5k leads in 3 requests
const MAX_PAGES = 20;     // hard stop, ~20k leads
const TTL_MS = 300_000;   // 5 min; the Refresh button can force a re-sweep
const CACHE_KEY = "appointments:v1";

// Raw Kylas row (only the parts we touch) …
type RawLead = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumbers?: { value?: string; type?: string }[] | null;
  requirementName?: string | null;
  companyBusinessType?: unknown;
  companyWebsite?: string | null;
  convertedAt?: string | null;
  customFieldValues?: Record<string, unknown> | null;
};

// … and the slim row we send to the browser. Kylas returns ~1KB per lead of
// fields nothing renders (recordActions, other custom fields, emails, owner);
// projecting here takes the 2.5k-lead payload from ~2.4MB to a few hundred KB.
type Lead = {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumbers?: { value?: string }[];
  requirementName?: string | null;
  companyBusinessType?: unknown;
  companyWebsite?: string | null;
  convertedAt?: string | null;
  cfVisitScheduled: string;
};

function project(l: RawLead, visitAt: string): Lead {
  const phone = l.phoneNumbers?.[0]?.value;
  return {
    id: l.id,
    firstName: l.firstName ?? null,
    lastName: l.lastName ?? null,
    ...(phone ? { phoneNumbers: [{ value: phone }] } : {}),
    requirementName: l.requirementName ?? null,
    companyBusinessType: l.companyBusinessType ?? null,
    companyWebsite: l.companyWebsite ?? null,
    convertedAt: l.convertedAt ?? null,
    cfVisitScheduled: visitAt,
  };
}

type Payload = {
  leads: Lead[];
  fetchedAt: string;
  scanned: number;
  requests: number;
};

async function sweep(apiKey: string): Promise<Payload> {
  const body = {
    fields: FIELDS,
    jsonRule: {
      condition: "OR",
      rules: BRANCH_ENUM_VALUES.map((v) => ({
        id: "companyBusinessType",
        field: "companyBusinessType",
        type: "string",
        input: "select",
        operator: "equal",
        value: v,
      })),
      valid: true,
    },
  };

  const leads: Lead[] = [];
  let scanned = 0;
  let requests = 0;
  let page = 0;

  while (page < MAX_PAGES) {
    const url = `${KYLAS_API_BASE}/search/lead?page=${page}&size=${PAGE_SIZE}&sort=${encodeURIComponent("updatedAt,desc")}`;
    const res = await rateLimitedFetch(url, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    requests++;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { content?: RawLead[]; totalPages?: number };
    const content = data.content ?? [];
    scanned += content.length;
    for (const l of content) {
      // Keep only leads that actually have a scheduled visit.
      const raw = l.customFieldValues?.cfVisitScheduled;
      if (typeof raw === "string" && raw) leads.push(project(l, raw));
    }
    page++;
    if (content.length === 0 || page >= (data.totalPages ?? 0)) break;
  }

  return { leads, fetchedAt: new Date().toISOString(), scanned, requests };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "KYLAS_API_KEY is not configured" }, { status: 500 });
  }

  const force = new URL(request.url).searchParams.get("refresh") === "1";
  const cached = getCached(CACHE_KEY) as Payload | null;
  if (cached && !force) {
    return Response.json({ ...cached, cached: true });
  }

  try {
    const payload = await sweep(apiKey);
    setCache(CACHE_KEY, payload, TTL_MS);
    return Response.json({ ...payload, cached: false });
  } catch (err) {
    // Serve the last good sweep rather than blanking the UI on a transient
    // Kylas error — the payload carries fetchedAt so callers can see the age.
    if (cached) {
      return Response.json({ ...cached, cached: true, stale: true });
    }
    const message = err instanceof Error ? err.message : "Upstream request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
