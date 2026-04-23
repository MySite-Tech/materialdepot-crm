import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const KYLAS_API_BASE =
  process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";

export async function POST(request: NextRequest) {
  const apiKey = process.env.KYLAS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "KYLAS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const formData = await request.formData();

  try {
    const res = await fetch(`${KYLAS_API_BASE}/documents`, {
      method: "POST",
      headers: { "api-key": apiKey },
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: text }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
