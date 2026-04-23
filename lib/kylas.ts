import type { Lead, Ticket, DashboardStats } from "./types";

const KYLAS_API_BASE = process.env.KYLAS_API_BASE_URL || "https://api.kylas.io/v1";
const KYLAS_API_KEY = process.env.KYLAS_API_KEY || "";

async function kylasRequest<T>(path: string): Promise<T> {
  if (!KYLAS_API_KEY) {
    throw new Error("KYLAS_API_KEY is not set. Please configure your .env.local file.");
  }

  const res = await fetch(`${KYLAS_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${KYLAS_API_KEY}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 60 }, // cache for 60 seconds
  });

  if (!res.ok) {
    throw new Error(`Kylas API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export async function getLeads(): Promise<Lead[]> {
  // TODO: Adjust the response shape to match the actual Kylas API response.
  // Reference: https://developers.kylas.io
  const data = await kylasRequest<{ data: Lead[] }>("/leads");
  return data.data;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function getTickets(): Promise<Ticket[]> {
  const data = await kylasRequest<{ data: Ticket[] }>("/tickets");
  return data.data;
}

// ---------------------------------------------------------------------------
// Dashboard stats (derived from leads + tickets)
// ---------------------------------------------------------------------------

export async function getDashboardStats(): Promise<DashboardStats> {
  const [leads, tickets] = await Promise.all([getLeads(), getTickets()]);

  const today = new Date().toISOString().split("T")[0];

  const wonLeads = leads.filter((l) => l.status === "Won").length;
  const lostLeads = leads.filter((l) => l.status === "Lost").length;
  const newToday = leads.filter((l) => l.createdAt.startsWith(today)).length;

  const openTickets = tickets.filter((t) => t.status === "Open").length;
  const inProgressTickets = tickets.filter((t) => t.status === "In Progress").length;
  const resolvedTickets = tickets.filter((t) => t.status === "Resolved").length;

  return {
    leads: {
      total: leads.length,
      newToday,
      won: wonLeads,
      lost: lostLeads,
      conversionRate:
        leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0,
    },
    tickets: {
      total: tickets.length,
      open: openTickets,
      inProgress: inProgressTickets,
      resolved: resolvedTickets,
      avgResolutionHours: 0, // Extend this once Kylas exposes resolution timestamps
    },
  };
}
