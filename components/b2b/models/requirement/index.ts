import { RequirementVersion, WithRequirement } from './types';

export type { RequirementVersion, WithRequirement } from './types';

export function withRequirementHistory<T extends WithRequirement>(
  before: WithRequirement | null | undefined,
  after: T,
  by: string,
  at: string,
): T {
  const prev = String(before?.requirement || '').trim();
  if (!prev || prev === String(after.requirement || '').trim()) return after;
  const history = after.requirementHistory || before?.requirementHistory || [];
  if (history[history.length - 1]?.text === prev) return after;
  const version: RequirementVersion = { text: prev, replacedAt: at, replacedBy: by };
  return { ...after, requirementHistory: [...history, version] };
}
