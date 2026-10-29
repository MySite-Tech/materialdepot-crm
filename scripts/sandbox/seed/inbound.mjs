import {
  INBOUND_PIPELINE, INTAKE_KYLAS_ID, KYLAS_CATEGORY, KYLAS_USERS, PERSONAS, PRESALES, STAGE_QUALIFIED, STAGE_WON,
} from '../constants.mjs';
import { istAt, istDay, lastEveningAfterFive, pastIstAt } from './time.mjs';

const ASHA = PERSONAS[0];
const BHARAT = PERSONAS[1];

export const leadId = (n) => 7000100 + n;
export const leadPhone = (n) => `90000100${String(n).padStart(2, '0')}`;

const rnr = (n, day, hour, by) => ({ n, outcome: 'RNR', at: pastIstAt(day, hour), by: by.name });
const connected = (n, day, hour, by, note, extra = {}) => ({
  n, outcome: 'Connected', at: pastIstAt(day, hour), by: by.name, note, durationMin: 6, ...extra,
});

const referral = (day, by, extra) => ({
  at: istAt(day, 12), by: by.name, decisionMaker: 'Principal designer', meetingTime: '11:30',
  meetingLocation: 'Their studio', summary: 'Two live projects, wants a sample walkthrough', ...extra,
});

const LEADS = [
  { n: 1, first: 'Aarav', last: 'Demo', at: () => pastIstAt(0, 10, 15), owner: null, summary: 'Office fit-out, 2,000 sq ft', cats: ['Laminates', 'Panels'] },
  { n: 2, first: 'Diya', last: 'Sample', at: () => pastIstAt(0, 15, 40), owner: null, summary: 'Villa interiors, flooring first', cats: ['Flooring'], source: 502 },
  { n: 3, first: 'Kabir', last: 'Placeholder', at: lastEveningAfterFive, owner: null, summary: 'Cafe refurbishment', cats: ['Tiles', 'Wallpaper'] },
  { n: 4, first: 'Meher', last: 'Test', at: () => istAt(-1, 11), owner: ASHA, summary: 'Two 3BHK flats', cats: ['Laminates'] },
  {
    n: 5, first: 'Neel', last: 'Example', at: () => istAt(-2, 12), owner: ASHA, summary: 'Clinic interiors', cats: ['Tiles'],
    crm: { stage: 'New', call_attempts: [rnr(1, -2, 15, ASHA), rnr(2, -1, 11, ASHA)] },
  },
  {
    n: 6, first: 'Ojas', last: 'Mock', at: () => istAt(-5, 10), owner: BHARAT, summary: 'Showroom panels', cats: ['Panels'], missed: 2,
    crm: { stage: 'New', call_attempts: [rnr(1, -5, 14, BHARAT), rnr(2, -3, 12, BHARAT), rnr(3, -1, 16, BHARAT)] },
  },
  {
    n: 7, first: 'Pari', last: 'Dummy', at: () => istAt(-6, 9, 30), owner: BHARAT, summary: 'Apartment block lobby', cats: ['Tiles'], missed: 3,
    crm: {
      stage: 'New',
      call_attempts: [rnr(1, -6, 11, BHARAT), rnr(2, -5, 12, BHARAT), rnr(3, -4, 15, BHARAT), rnr(4, -2, 10, BHARAT), rnr(5, 0, 9, BHARAT)],
    },
  },
  {
    n: 8, first: 'Reyansh', last: 'Trial', at: () => istAt(-3, 13), owner: ASHA, summary: 'Restaurant wallpaper', cats: ['Wallpaper'],
    crm: { stage: 'New', call_attempts: [rnr(1, 0, 9, ASHA)] },
  },
  {
    n: 9, first: 'Saanvi', last: 'Fictional', at: () => istAt(-4, 10), owner: ASHA, summary: 'Residential projects, recurring', cats: ['Laminates', 'Panels'],
    crm: {
      stage: 'Connected - Need nurturing', company_name: 'Fictional Spaces', client_type: 'Interior Designer', segment: '2', lead_type: 'Warm', priority: 'P2',
      requirement: 'Laminates for two upcoming flats', expected_order_value: 150000,
      primary_contact_name: 'Saanvi Fictional', primary_contact_phone: leadPhone(9),
      additional_contacts: [{ name: 'Site lead (demo)', phone: '9000019009' }],
      call_attempts: [rnr(1, -4, 12, ASHA), connected(2, -3, 11, ASHA, 'Spoke to the principal. Projects start next month.')],
      notes: [
        { ts: istAt(-3, 11, 20), author: ASHA.name, text: 'Wants laminate samples couriered before a meeting.' },
        { ts: istAt(-1, 16), author: ASHA.name, text: 'Samples dispatched. Call back after they review.' },
      ],
    },
  },
  {
    n: 10, first: 'Tara', last: 'Prototype', at: () => istAt(-6, 11), owner: BHARAT, summary: 'Office floor, 4,500 sq ft', cats: ['Flooring', 'Tiles'],
    crm: {
      stage: 'Follow up', company_name: 'Trial Interiors', client_type: 'Contractor', segment: '2', lead_type: 'Hot', priority: 'P1',
      requirement: 'Vinyl flooring quote', follow_up_date: istDay(1), follow_up_time: '11:00',
      call_attempts: [rnr(1, -6, 15, BHARAT), connected(2, -5, 12, BHARAT, 'Asked for a quote by Friday.', { followUpDate: istDay(1) })],
    },
  },
  {
    n: 11, first: 'Uday', last: 'Sandbox', at: () => istAt(-10, 10), owner: ASHA, summary: 'Boutique hotel rooms', cats: ['Laminates', 'Wallpaper'],
    crm: {
      stage: 'PI Shared', company_name: 'Prototype Projects', client_type: 'Architect', segment: '3', lead_type: 'Hot', priority: 'P1',
      requirement: '18 rooms, laminate and wallpaper', enq_id: 'ENQ-900101', order_value: 245000, order_value_source: 'deal',
      pi_shared_at: istAt(-2, 15), status_changed_at: istAt(-2, 15), follow_up_date: istDay(2),
      placed_under: { bmName: 'Ravi (EC BM)', spok: ASHA.name, ecName: 'JP Nagar', ecBmName: 'Ravi (EC BM)' },
      call_attempts: [connected(1, -9, 11, ASHA, 'Shared the catalogue.'), connected(2, -2, 14, ASHA, 'PI sent from JP Nagar.')],
    },
  },
  {
    n: 12, first: 'Vihaan', last: 'Lorem', at: () => istAt(-15, 10), owner: BHARAT, won: true, summary: 'Builder sample flat', cats: ['Tiles'],
    crm: {
      stage: 'Closed', company_name: 'Sandbox Studio', client_type: 'Builder', segment: '3', lead_type: 'Hot', priority: 'P1',
      enq_id: 'ENQ-900102', order_value: 380000, order_value_source: 'deal', pi_shared_at: istAt(-8, 12), status_changed_at: istAt(-5, 17),
      placed_under: { bmName: 'Sneha (EC BM)', spok: BHARAT.name, ecName: 'Whitefield', ecBmName: 'Sneha (EC BM)' },
      call_attempts: [connected(1, -14, 11, BHARAT, 'Visited Whitefield EC.')],
    },
  },
  {
    n: 13, first: 'Zoya', last: 'Ipsum', at: () => istAt(-9, 12), owner: ASHA, summary: 'Small office', cats: ['Panels'],
    crm: {
      stage: 'Lost', company_name: 'Lorem Living', client_type: 'Interior Designer', lost_reason: 'Bought from another supplier', status_changed_at: istAt(-3, 12),
      call_attempts: [connected(1, -8, 12, ASHA, 'Comparing quotes.'), connected(2, -3, 12, ASHA, 'Went elsewhere on price.')],
    },
  },
  {
    n: 14, first: 'Arjun', last: 'Specimen', at: () => istAt(-8, 15), owner: BHARAT, summary: 'Own flat', cats: ['Tiles'],
    crm: {
      stage: 'Invalid', company_name: 'Ipsum Interiors', invalid_reason: 'Homeowner, not a professional',
      invalid_note: 'Single flat for their own use, sent to retail.', status_changed_at: istAt(-7, 11),
      call_attempts: [connected(1, -7, 11, BHARAT, 'Homeowner, not a firm.')],
    },
  },
  {
    n: 15, first: 'Bela', last: 'Acme', at: () => istAt(-12, 10), owner: ASHA, summary: 'Co-working fit-out', cats: ['Panels', 'Flooring'],
    crm: {
      stage: 'Follow up', company_name: 'Acme Fitouts', client_type: 'Contractor', segment: '2', lead_type: 'Warm', priority: 'P2',
      requirement: 'Acoustic panels and flooring', office_location: 'Koramangala (demo address)', follow_up_date: istDay(3),
      outreach_referral: referral(-1, ASHA, { project: 'Co-working floor, 8,000 sq ft', meetingDate: istDay(2), note: 'Prefers a morning meeting.' }),
      call_attempts: [connected(1, -11, 12, ASHA, 'Wants someone to visit.')],
    },
  },
  {
    n: 16, first: 'Chirag', last: 'Specimen', at: () => istAt(-14, 11), owner: BHARAT, summary: 'Design studio, several sites', cats: ['Laminates'],
    crm: {
      stage: 'Follow up', company_name: 'Specimen Studio', client_type: 'Interior Designer', segment: '2', lead_type: 'Hot', priority: 'P1',
      requirement: 'Laminates across three sites', follow_up_date: istDay(4),
      outreach_referral: referral(-9, BHARAT, { project: 'Three residential sites', meetingDate: istDay(-6), note: 'Owner decides, call before visiting.' }),
      call_attempts: [connected(1, -13, 11, BHARAT, 'Good fit for Outreach.')],
    },
  },
  {
    n: 17, first: 'Dev', last: 'Draft', at: () => istAt(-7, 10), owner: ASHA, summary: 'Modular kitchens', cats: ['Laminates', 'Others'],
    crm: {
      stage: 'Connected - Need nurturing', company_name: 'Draft Designs', client_type: 'Interior Designer', segment: '1', lead_type: 'Warm',
      requirement: 'Kitchen shutters', outreach_referral: referral(-2, ASHA, { project: 'Ten kitchens a month', meetingDate: istDay(1), note: 'Factory visit welcome.' }),
      call_attempts: [connected(1, -6, 12, ASHA, 'Interested in a factory visit.')],
    },
  },
];

const ownerName = (id) => KYLAS_USERS.find((u) => u.id === id)?.name ?? '';

function kylasLead(s) {
  const at = s.at();
  const ownerId = s.owner?.kylasId ?? INTAKE_KYLAS_ID;
  return {
    id: leadId(s.n), firstName: s.first, lastName: s.last, ownerId,
    pipeline: { id: INBOUND_PIPELINE, name: 'B2B Inbound' },
    pipelineStage: s.won ? STAGE_WON : STAGE_QUALIFIED,
    phoneNumbers: [{ id: 8000100 + s.n, type: 'MOBILE', code: 'IN', dialCode: '+91', value: leadPhone(s.n), primary: true }],
    source: s.source ?? 501,
    city: s.n % 3 ? 'Immediate' : 'Not sure',
    zipcode: s.n % 4 ? '560078' : '500032',
    companyZipcode: 'B2B Qualified',
    requirementName: '',
    createdAt: at,
    updatedAt: at,
    customFieldValues: {
      cfPsOwner: PRESALES,
      cfMissedCallCount: s.missed ?? 0,
      cfSpaceRequirement: s.summary,
      cfClientType: s.crm?.client_type ?? 'Interior Designer',
      cfCategoriesOfInterest: s.cats.map((c) => KYLAS_CATEGORY[c]),
      cfBranch: 'JP Nagar',
    },
    metaData: {
      idNameStore: {
        source: { 501: 'Website Form', 502: 'WhatsApp' },
        pipelineStage: { [STAGE_QUALIFIED]: 'B2B Qualified', [STAGE_WON]: 'Won' },
        ownerId: { [ownerId]: ownerName(ownerId) },
      },
    },
  };
}

const CRM_DEFAULTS = {
  company_name: '', gst_number: '', segment: '', client_type: '', lead_type: '', priority: '', location: '',
  call_attempts: [], selections: [], requirement: '', expected_order_value: 0, follow_up_date: '', follow_up_time: '',
  enq_id: '', order_value: 0, order_value_source: '', lost_reason: '', invalid_reason: '', invalid_note: '',
  status_changed_at: '', pi_shared_at: '', office_location: '', outreach_referral: {}, placed_under: {}, kam: '',
  notes: [], primary_contact_name: '', primary_contact_phone: '', additional_contacts: [],
};

const SELECTION_OF = { 2689623: 'Tiles', 2689624: 'Panels', 2689625: 'Laminates', 2689626: 'Wallpaper', 2689627: 'Flooring', 2689628: 'Others' };

function inboundRow(lead, s) {
  const cf = lead.customFieldValues;
  const contact = `${lead.firstName} ${lead.lastName}`;
  const meta = {
    ...CRM_DEFAULTS,
    location: lead.zipcode.startsWith('5000') ? 'Hyderabad' : 'Bangalore',
    selections: cf.cfCategoriesOfInterest.map((id) => SELECTION_OF[id]),
    status_changed_at: s.crm.call_attempts.at(-1)?.at ?? lead.createdAt,
    ...s.crm,
    company: s.crm.company_name || contact,
    phone: leadPhone(s.n),
    contact_name: contact,
    owner_kylas_id: lead.ownerId,
    kylas_stage: lead.pipelineStage,
    source: lead.source === 502 ? 'WhatsApp' : 'Website form',
    lead_created_at: lead.createdAt,
    qualification_tag: lead.companyZipcode,
    presales_owner: cf.cfPsOwner,
    lead_summary: cf.cfSpaceRequirement,
    urgency: lead.city,
    pincode: lead.zipcode,
    presales_client_type: cf.cfClientType,
    presales_missed_calls: cf.cfMissedCallCount,
  };
  delete meta.stage;
  return {
    id: String(lead.id), pipeline: 'inbound', stage: s.crm.stage, kylas_lead_id: String(lead.id),
    owner: s.owner.name, value: Number(meta.order_value) || 0,
    created_at: lead.createdAt, updated_at: meta.status_changed_at, meta_data: meta,
  };
}

let noteId = 600000;
let callId = 500000;

const kylasNote = (n, day, hour, text) => ({
  id: ++noteId, targetEntityId: String(leadId(n)), targetEntityType: 'LEAD', description: `<div>${text}</div>`,
  createdAt: istAt(day, hour), createdBy: { id: 990009, name: PRESALES },
});

const presalesCall = (n, day, hour, outcome, seconds, summary) => ({
  id: ++callId, relatedTo: [{ id: leadId(n), entity: 'lead', name: `Lead ${leadId(n)}` }], createdAt: istAt(day, hour),
  callType: 'outgoing', outcome, duration: seconds, notes: '', callSummary: summary, createdBy: { id: 990009, name: PRESALES },
});

export function seedInbound() {
  const leads = LEADS.map(kylasLead);
  const rows = LEADS.filter((s) => s.crm).map((s) => inboundRow(leads.find((l) => l.id === leadId(s.n)), s));
  const notes = [
    kylasNote(9, -4, 10, 'Qualified on call. Runs a small studio, two flats in pipeline.'),
    kylasNote(9, -4, 11, 'Prefers WhatsApp for catalogues.'),
    kylasNote(10, -6, 11, 'Contractor, asked for flooring rates.'),
  ];
  const callLogs = [
    presalesCall(9, -4, 10, 'connected', 240, 'Presales qualified the lead: studio owner, recurring residential work.'),
    presalesCall(6, -5, 9, 'no_answer', 0, ''),
  ];
  const assignments = [{
    id: 1, lead_id: String(leadId(4)), lead_created_at: leads[3].createdAt, kind: 'round_robin', to_kylas_id: ASHA.kylasId,
    to_name: ASHA.name, from_kylas_id: INTAKE_KYLAS_ID, reason: null, by_name: ASHA.name, at: istAt(-1, 11, 5),
  }];
  return { leads, rows, notes, callLogs, assignments };
}
