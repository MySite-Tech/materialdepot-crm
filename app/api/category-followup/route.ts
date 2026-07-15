import { getCached, setCache, cleanup } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Live "Category Follow Up" abandoned-cart sheet (Metabase public CSV, refreshed
// ~every 2 min upstream). Proxied server-side so the browser never hits the
// Metabase host directly (avoids CORS) and so multi-user polling is de-duped
// behind a short cache.
const CSV_URL =
  process.env.CATEGORY_FOLLOWUP_CSV_URL ||
  "https://metabase.materialdepot.in/public/question/850a022e-6927-4829-b784-58464c5624ec.csv";

const CACHE_KEY = "category-followup-csv";
const CACHE_TTL = 60_000; // 60s — shorter than the 2-min upstream refresh

export async function GET() {
  cleanup();

  const cached = getCached(CACHE_KEY);
  if (typeof cached === "string") {
    return new Response(cached, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  }

  try {
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `Upstream returned ${res.status}: ${text.slice(0, 300)}` },
        { status: res.status },
      );
    }
    const csv = await res.text();
    setCache(CACHE_KEY, csv, CACHE_TTL);
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
