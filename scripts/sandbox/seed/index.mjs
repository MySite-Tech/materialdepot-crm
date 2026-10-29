import { seedInbound } from './inbound.mjs';
import { seedPipeline } from './pipeline.mjs';

export function seed() {
  const inbound = seedInbound();
  const pipeline = seedPipeline();
  return {
    seededAt: new Date().toISOString(),
    kylas: { leads: inbound.leads, notes: inbound.notes, callLogs: inbound.callLogs, nextId: 900000 },
    backend: {
      rows: [...inbound.rows, ...pipeline.rows],
      team: pipeline.team,
      assignments: inbound.assignments,
      nextAssignmentId: inbound.assignments.length + 1,
      target: null,
    },
    django: { deals: pipeline.deals },
    partner: { banners: [], launches: [] },
  };
}
