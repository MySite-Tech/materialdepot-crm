import { CATEGORY_ORDER, CAT_CUSTOM_WP, CAT_FLOORING, CAT_UNSET, CAT_WALLPAPER, TICKED_LIST_LABELS, TICKED_ROOM_LABELS } from '../../constants/coe';
import { CoeInstall, CoeOrder, CoeSubjob } from '../../types/coe';
function sortCats(list: string[]): string[] {
  return [...new Set(list)].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
}

function tickedCategories(auditTicked: any): string[] {
  if (Array.isArray(auditTicked)) {
    return sortCats(auditTicked
      .map((x: any) => TICKED_LIST_LABELS[String(x || '').trim().toLowerCase()])
      .filter(Boolean) as string[]);
  }
  const rooms = auditTicked && Array.isArray(auditTicked.rooms) ? auditTicked.rooms : null;
  if (!rooms) return [];
  const out: string[] = [];
  for (const r of rooms) {
    const key = String((r && (r.category || r.type)) || '').toLowerCase();
    let label = TICKED_ROOM_LABELS[key];
    if (!label) continue;
    if (label === CAT_WALLPAPER && String((r && r.variant) || '').toLowerCase().startsWith('custom')) label = CAT_CUSTOM_WP;
    out.push(label);
  }
  return sortCats(out);
}

export function auditCategoryMap(rows: any[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows || []) {
    if (!r || !r.id) continue;
    m.set(String(r.id), tickedCategories(r.audit_ticked));
  }
  return m;
}

export function applyCoeCategories(orders: CoeOrder[], cats: Map<string, string[]>): CoeOrder[] {
  if (!cats.size) return orders;
  return orders.map((o) => {
    const t = cats.get(String(o.id));

    if (!t || (t.length === o.tickedCats.length && t.every((x, i) => x === o.tickedCats[i]))) return o;
    return { ...o, tickedCats: t };
  });
}

export function auditCategories(o: CoeOrder): string[] {
  if (o.tickedCats.length) return o.tickedCats;
  const out: string[] = [];
  const svc = o.service || {};
  if (Array.isArray(svc.flooring) && svc.flooring.length) out.push(CAT_FLOORING);
  if (Array.isArray(svc.wallpaper) && svc.wallpaper.length) out.push(CAT_WALLPAPER);
  const codes = (o.skus || []).filter((s: any) => !s.audit).map((s: any) => String(s.c || '').toUpperCase()).join(' ');
  if (/CWP-|CUSTOM/.test(codes)) out.push(CAT_CUSTOM_WP);
  if (!out.length) {
    if (/WF-|FLOOR/.test(codes)) out.push(CAT_FLOORING);
    if (/WP-|WALL/.test(codes)) out.push(CAT_WALLPAPER);
  }
  return sortCats(out);
}

export function subjobCategory(sj: CoeSubjob, io?: CoeInstall): string {
  const base = TICKED_ROOM_LABELS[String(sj.type || '').toLowerCase()];
  if (!base) return CAT_UNSET;
  if (base === CAT_WALLPAPER && io?.customWp) return CAT_CUSTOM_WP;
  return base;
}

export function matchesCategory(cats: string[], selected: string[]): boolean {
  if (!selected.length) return true;
  if (!cats.length) return selected.includes(CAT_UNSET);
  return cats.some((c) => selected.includes(c));
}
