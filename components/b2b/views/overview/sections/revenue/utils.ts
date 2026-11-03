export const share = (n: number, d: number): string => (d > 0 ? `${Math.round((n / d) * 100)}%` : '0%');
