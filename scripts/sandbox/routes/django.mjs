import { djangoRouter, envelope, localUser, tenDigits } from '../../stub/django.mjs';
import { BRANCHES, DEAL_LOST_STATUSES, DEAL_ORDER_STATUSES, EC_BMS, PERSONAS } from '../constants.mjs';

const PEOPLE = [...PERSONAS, ...EC_BMS];

const isOrder = (s) => DEAL_ORDER_STATUSES.includes(s);
const isLost = (s) => DEAL_LOST_STATUSES.includes(s);
const orderDay = (d) => String(d.closureDate || d.createdAt || '').slice(0, 10);

function bucket(deals) {
  return {
    count: deals.length,
    value: deals.reduce((s, d) => s + d.cartValue, 0),
    valueExclGst: deals.reduce((s, d) => s + d.cartValueExclGst, 0),
  };
}

function stats(deals) {
  const statuses = [...new Set(deals.map((d) => d.status))];
  return {
    total: bucket(deals),
    active: bucket(deals.filter((d) => !isOrder(d.status) && !isLost(d.status))),
    won: bucket(deals.filter((d) => isOrder(d.status))),
    lost: bucket(deals.filter((d) => isLost(d.status))),
    byStatus: statuses.map((status) => ({ status, ...bucket(deals.filter((d) => d.status === status)) })),
  };
}

function history(deals) {
  const orders = deals.filter((d) => isOrder(d.status)).sort((a, b) => orderDay(a).localeCompare(orderDay(b)));
  const open = deals.filter((d) => !isOrder(d.status) && !isLost(d.status));
  const rank = (s) => (isOrder(s) ? 2 : isLost(s) ? 0 : 1);
  const furthest = [...deals].sort((a, b) => rank(b.status) - rank(a.status))[0];
  return {
    orders: orders.length,
    lifetimeValue: orders.reduce((s, d) => s + d.cartValue, 0),
    openValue: open.reduce((s, d) => s + d.cartValue, 0),
    enquiries: deals.length,
    enquiryValue: deals.reduce((s, d) => s + d.cartValue, 0),
    furthestStatus: furthest?.status ?? null,
    firstOrderDate: orders[0] ? orderDay(orders[0]) : null,
    firstOrderValue: orders[0]?.cartValue ?? null,
    lastOrderDate: orders.length ? orderDay(orders.at(-1)) : null,
  };
}

const list = (query, key) => String(query.get(key) || '').split(',').map((s) => s.trim()).filter(Boolean);

function filterDeals(deals, query) {
  const q = String(query.get('q') || '').trim().toLowerCase();
  const enq = new Set(list(query, 'enquiry_ids').map((s) => s.toUpperCase()));
  const status = query.get('status');
  const bm = query.get('bm');
  return deals.filter((d) => {
    if (enq.size && !enq.has(d.id.toUpperCase())) return false;
    if (status && d.status !== status) return false;
    if (bm && tenDigits(bm) !== d.assigneePhone && bm !== d.assignedTo) return false;
    if (!q) return true;
    const qd = tenDigits(q);
    return (qd.length >= 4 && tenDigits(d.clientPhone).includes(qd))
      || [d.clientName, d.id].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function leadsPage(deals, query) {
  const size = Number(query.get('page_size')) || 25;
  const n = Math.max(1, Number(query.get('page')) || 1);
  const rows = filterDeals(deals, query).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { results: rows.slice((n - 1) * size, n * size), count: rows.length, page: n, pageSize: size, totalPages: Math.max(1, Math.ceil(rows.length / size)) };
}

function byPhone(deals, phones) {
  return Object.fromEntries(phones.map((p) => [p, history(deals.filter((d) => tenDigits(d.clientPhone) === tenDigits(p)))]));
}

function extra(db) {
  return ({ path, query }) => {
    const p = path.replace(/^\/apiV1/, '');
    if (p === '/crm/leads/') return envelope(leadsPage(db.deals, query));
    if (p === '/crm/leads/stats/') {
      const groups = String(query.get('bm_groups') || '').split('|').filter(Boolean).map((g) => {
        const [label, contacts = ''] = g.split(':');
        return [label, contacts.split(',').map(tenDigits)];
      });
      if (!groups.length) return envelope(stats(filterDeals(db.deals, query)));
      return envelope({
        groups: Object.fromEntries(groups.map(([label, phones]) => [label, stats(db.deals.filter((d) => phones.includes(d.assigneePhone)))])),
        branchTotal: stats(db.deals),
        basis: query.get('branch_basis') || 'created',
      });
    }
    if (p === '/crm/leads/client-order-history/') return envelope(byPhone(db.deals, list(query, 'phones')));
    if (p === '/crm/leads/b2b-bulk/') {
      const enq = new Set(list(query, 'enquiry_ids').map((s) => s.toUpperCase()));
      return envelope({
        histories: byPhone(db.deals, list(query, 'phones')),
        deals: db.deals.filter((d) => enq.has(d.id.toUpperCase())).map(({ id, clientPhone, cartValue, status }) => ({ id, clientPhone, cartValue, status })),
      });
    }
    if (p === '/crm/available-bms/') {
      const want = list(query, 'branch').map((b) => b.toLowerCase());
      const bms = EC_BMS.filter((b) => !want.length || b.branches.some((x) => want.includes(x.toLowerCase())));
      return envelope({ available_bms: bms.map((b) => ({ name: b.name, contact: b.phone })) });
    }
    if (p === '/orgainsation-branch/') return envelope(BRANCHES);
    return undefined;
  };
}

export function djangoRoutes(db) {
  const fallback = localUser('admin', []);
  const userForPhone = (phone) => PEOPLE.find((u) => phone && u.phone === tenDigits(phone)) ?? fallback(phone);
  return djangoRouter({
    userForPhone,
    userForId: (id) => PEOPLE.find((u) => u.userId === id) ?? (id === fallback().userId ? fallback() : undefined),
    roster: () => [...PEOPLE, fallback()],
    extra: extra(db),
  });
}
