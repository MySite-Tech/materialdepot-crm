import { HEAT_GOOD, HEAT_MID, SCORE_COLORS } from '../constants';

export const fmt = (n: number) => n.toLocaleString('en-IN');
export const count = (n: number, word: string) => `${fmt(n)} ${n === 1 ? word.replace(/s$/, '') : word}`;
export const pct = (a: number, b: number) => (b ? Math.round((a * 1000) / b) / 10 : 0);
export const pctText = (a: number, b: number) => (b ? `${pct(a, b)}%` : '–');
export const avg1 = (x: number) => x.toFixed(1);
export const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const SCALE = [SCORE_COLORS[4], HEAT_GOOD, '#D97706', SCORE_COLORS[0]];
const GRADE_SCALE = [SCORE_COLORS[4], HEAT_GOOD, '#F59E0B', SCORE_COLORS[0]];
const GRADES = ['Excellent', 'Good', 'Needs work', 'Poor'];
const tier = (v: number, [a, b, c]: [number, number, number]) => (v >= a ? 0 : v >= b ? 1 : v >= c ? 2 : 3);

export const avgColor = (a: number) => SCALE[tier(a, [3, 2, 1])];
export const coverageColor = (p: number) => SCALE[tier(p, [60, 35, 15])];
export const walkinColor = (p: number) => SCALE[tier(p, [0.8, 0.6, 0.4])];
export const walkinBoxColor = (p: number) => GRADE_SCALE[tier(p, [80, 60, 40])];
export const grade = (a: number): [string, string] => { const i = tier(a, [3, 2, 1]); return [GRADES[i], GRADE_SCALE[i]]; };

export function mix(c1: string, c2: string, t: number) {
  const parse = (x: string) => [1, 3, 5].map(i => parseInt(x.substr(i, 2), 16));
  const a = parse(c1);
  const b = parse(c2);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

export const goodBadHeat = (good: number) =>
  good >= 0.5 ? mix(HEAT_MID, HEAT_GOOD, (good - 0.5) * 2) : mix(SCORE_COLORS[0], HEAT_MID, good * 2);
