export interface RequirementVersion {
  text: string;
  replacedAt: string;
  replacedBy: string;
}

export interface WithRequirement {
  requirement?: string;
  requirementHistory?: RequirementVersion[];
}
