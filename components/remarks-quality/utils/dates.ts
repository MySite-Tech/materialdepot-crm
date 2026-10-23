const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const iso = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

export const IST = 'Asia/Kolkata';
const istDay = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });
const istHourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', hourCycle: 'h23' });

export const today = () => istDay.format(new Date());
export const istHour = () => +istHourFmt.format(new Date());

export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + n);
  return iso(x);
};

export const dayOfWeek = (d: string) => new Date(`${d}T00:00:00`).getDay();

export const dlabel = (d: string) => {
  if (!d) return '';
  const [, m, dd] = d.split('-');
  return `${+dd} ${MON[+m - 1]}`;
};

export const hhmm = (mins: number) => {
  const h = Math.floor(mins / 60);
  return `${((h + 11) % 12) + 1}:${String(mins % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export const rangeLabel = (r: [string, string]) =>
  r[0] && r[0] === r[1] ? dlabel(r[0]) : `${r[0] ? dlabel(r[0]) : '…'} – ${r[1] ? dlabel(r[1]) : '…'}`;

export function dayList(from: string, to: string, cap = 200): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < cap; d = addDays(d, 1)) out.push(d);
  return out;
}

export function datePresets(days: number): Array<[string, string, string]> {
  const t = today();
  const m0 = `${t.slice(0, 8)}01`;
  const first = new Date(`${m0}T00:00:00`);
  const pm = iso(new Date(first.getFullYear(), first.getMonth() - 1, 1));
  return [
    ['Today', t, t], ['Yesterday', addDays(t, -1), addDays(t, -1)], ['Last 7 days', addDays(t, -6), t],
    ['Last 14 days', addDays(t, -13), t], ['This month', m0, t], ['Last month', pm, addDays(m0, -1)],
    ['Last 30 days', addDays(t, -29), t], [`All (${days}d)`, '', ''],
  ];
}
