import { sameRep } from '../outreach/handover';
import { Period } from '../outreach/kpis';
import { INBOUND_ENGINE } from './teams/inbound';
import { KAM_ENGINE } from './teams/kam';
import { OUTREACH_ENGINE } from './teams/outreach';
import { DayRow, PerfCard, PerfData, Person, TeamEngine } from './types';
import { MAX_DAILY_ROWS, elapsedDays, personKey, unknownCard } from './utils';
import type { B2BTeam, TeamMember, Viewer } from '@/lib/b2b/team/types';
import { normalisePhone } from '@/lib/org/utils';

export const ENGINES: Record<B2BTeam, TeamEngine> = {
  inbound: INBOUND_ENGINE,
  outreach: OUTREACH_ENGINE,
  kam: KAM_ENGINE,
};

export const TEAM_ORDER: B2BTeam[] = ['inbound', 'outreach', 'kam'];

export function selfOn(data: PerfData, viewer: Viewer, members: TeamMember[], live: boolean): { team: B2BTeam; person: Person }[] {
  const m = viewer.member;
  if (m) return [{ team: m.team, person: { key: personKey(m.name, m.phone), name: m.name, phone: m.phone, kylasUserId: m.kylasUserId, onTeam: true } }];
  if (!viewer.name) return [];
  return TEAM_ORDER.flatMap((team) => {
    const hit = ENGINES[team].people(data, members, live).find((p) => (
      viewer.phone && p.phone ? normalisePhone(p.phone) === viewer.phone : sameRep(p.name, viewer.name)));
    return hit ? [{ team, person: { ...hit, phone: hit.phone || viewer.phone } }] : [];
  });
}

export function failedSources(engine: TeamEngine, data: PerfData): string[] {
  return engine.sources.filter((s) => data.failed.includes(s));
}

export function scoreCard(engine: TeamEngine, data: PerfData, people: Person[], period: Period): PerfCard {
  const failed = failedSources(engine, data);
  if (failed.length) return unknownCard(engine.defs, `${failed.join(', ')} did not load`);
  return engine.card(data, people, period);
}

export function dailyCards(engine: TeamEngine, data: PerfData, people: Person[], period: Period): { rows: DayRow[]; clipped: number } {
  const days = elapsedDays(period, data.today);
  const shown = days.slice(-MAX_DAILY_ROWS).reverse();
  const perDay = { ...data, assigned: undefined };
  return {
    rows: shown.map((day) => ({ day, card: scoreCard(engine, perDay, people, { from: day, to: day }) })),
    clipped: days.length - shown.length,
  };
}
