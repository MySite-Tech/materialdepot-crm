'use client';

export interface Props {
  branches: string[];
  allowedBranches: string[];
}

export interface FilterChipProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  color?: { active: string };
  searchable?: boolean;
}

export interface DateRange { from: string; to: string }

export interface DateChipProps {
  label: string;
  value: DateRange;
  onChange: (v: DateRange) => void;
  color?: { active: string };
}
