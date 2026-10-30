const IST_MS = 330 * 60_000;

export function istAt(dayOffset, hour, minute = 0) {
  const now = new Date(Date.now() + IST_MS);
  const wall = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hour, minute);
  return new Date(wall - IST_MS).toISOString();
}

export const istDay = (dayOffset) => istAt(dayOffset, 12).slice(0, 10);

export function pastIstAt(dayOffset, hour, minute = 0) {
  const at = istAt(dayOffset, hour, minute);
  return Date.parse(at) <= Date.now() ? at : new Date(Date.now() - 10 * 60_000).toISOString();
}

export function lastEveningAfterCutoff() {
  const today = istAt(0, 19, 30);
  return Date.parse(today) <= Date.now() ? today : istAt(-1, 20, 30);
}
