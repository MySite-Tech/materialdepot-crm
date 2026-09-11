export interface DateRange { from: string; to: string }

export interface DateChipPreset {
  label: string;
  range: () => DateRange;
}

export interface FilterChipProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  color?: { active: string };
}

export interface DateChipProps {
  label: string;
  value: DateRange;
  onChange: (v: DateRange) => void;
  color?: { active: string };
  presets?: DateChipPreset[];
}
