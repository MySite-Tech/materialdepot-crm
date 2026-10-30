import { PERSONAS } from '../constants.mjs';
import { leadId, leadPhone } from './inbound.mjs';
import { istAt, istDay } from './time.mjs';

const [ASHA, BHARAT, OMKAR, KAVYA, MEERA] = PERSONAS;

const deal = (id, phone, client, status, cartValue, bm, branch, day, extra = {}) => ({
  id, leadId: id, ticketId: Number(id.replace(/\D/g, '')), clientName: client, clientPhone: phone,
  assignedTo: bm.name, assigneePhone: bm.phone, branch, status, cartValue,
  cartValueExclGst: Math.round(cartValue / 1.18), cartItems: 'Demo cart (sandbox)', clientType: 'B2B',
  propertyType: 'Commercial', architectInvolved: true, projectPhase: 'Execution',
  followUpDate: '', closureDate: '', lostMarkDate: '', lostReason: '', createdAt: istAt(day, 12),
  visits: [], remarks: [], ...extra,
});

const RAVI = { name: 'Ravi (EC BM)', phone: '9000000031' };
const SNEHA = { name: 'Sneha (EC BM)', phone: '9000000032' };
const IMRAN = { name: 'Imran (EC BM)', phone: '9000000033' };

function seedDeals() {
  return [
    deal('ENQ-900101', leadPhone(11), 'Prototype Projects', 'Estimate Shared', 245000, RAVI, 'JP Nagar', -3, { followUpDate: istDay(2) }),
    deal('ENQ-900102', leadPhone(12), 'Sandbox Studio', 'Order Placed', 380000, SNEHA, 'Whitefield', -8, { closureDate: istDay(-5) }),
    deal('ENQ-900103', '9000020001', 'Mockup Interiors', 'Order Placed', 520000, IMRAN, 'HSR', -6, { closureDate: istDay(-4) }),
    deal('ENQ-900104', '9000020002', 'Template Builders', 'Delivered', 610000, SNEHA, 'Whitefield', -30, { closureDate: istDay(-25) }),
    deal('ENQ-900105', '9000020003', 'Exemplar Interiors', 'Delivered', 180000, RAVI, 'JP Nagar', -50, { closureDate: istDay(-45) }),
    deal('ENQ-900106', leadPhone(9), 'Fictional Spaces', 'Cart Created', 90000, RAVI, 'JP Nagar', -1),
    deal('ENQ-900107', leadPhone(16), 'Specimen Studio', 'Estimate Shared', 150000, IMRAN, 'HSR', -2, { followUpDate: istDay(3) }),
  ];
}

const OUTREACH_DEFAULTS = {
  designation: null, gst_number: null, segment: null, lead_type: null, company_type: null, company_type_other: null,
  meetings: [], selections: [], requirement: null, expected_order_value: null, follow_up_date: null,
  quote_shared_at: null, enq_id: null, order_value: null, order_value_source: null, deal_status: null, expected_closure: null,
  lost_reason: null, kam: null, ec_name: null, ec_bm_name: null, notes: [], alt_phone: null, alt_name: null, alt_role: null, contacts: [], email: null,
  city: 'Bangalore', office_address: null, team_size: null, whatsapp_group_link: null, converted_at: null,
  new_onboarding: null, intake: null, handover: null, journey: [],
};

function outreachRow(id, stage, created, meta) {
  const m = {
    ...OUTREACH_DEFAULTS, created_at: created, status_changed_at: created, spok: OMKAR.name, bm_phone: OMKAR.phone, ...meta,
  };
  return {
    id, pipeline: 'outbound', stage, kylas_lead_id: null, owner: OMKAR.name, value: Number(m.order_value) || 0,
    created_at: created, updated_at: m.status_changed_at, meta_data: m,
  };
}

const meeting = (n, day, status, extra = {}) => ({
  n, date: istDay(day), time: '11:00', area: 'Indiranagar', officeLocation: 'Demo office, 2nd floor', status,
  loggedBy: OMKAR.name, updatedAt: istAt(Math.min(day, 0), 18), ...extra,
});

const event = (day, by, kind, text) => ({ at: istAt(day, 12), by: by.name, kind, text });

function seedOutreach() {
  const fromSpecimen = outreachRow(`OR-IN-${leadId(16)}`, 'Follow up', istAt(-9, 13), {
    company: 'Specimen Studio', contact_person: 'Chirag Specimen', phone: leadPhone(16), segment: '2', lead_type: 'Hot',
    company_type: 'Interior Designer', selections: ['Laminates'], source: 'Inbound', team_size: '6-15',
    requirement: 'Decision maker: Principal designer\nProject: Three residential sites\nFrom Bharat (Inbound): Owner decides, call before visiting.',
    enq_id: 'ENQ-900107', follow_up_date: istDay(2), status_changed_at: istAt(-6, 18),
    meetings: [
      meeting(1, -6, 'Completed', { metWith: 'Owner / Principal', notes: 'Walked through laminate shades; quote requested.', pin: { lat: 12.97, lng: 77.64, at: istAt(-6, 11) } }),
      meeting(2, 2, 'Scheduled'),
    ],
    intake: {
      from: 'Inbound', inboundLeadId: String(leadId(16)), inboundOwner: BHARAT.name, inboundStage: 'Follow up',
      assignedAt: istAt(-9, 13), assignedBy: MEERA.name, acceptedAt: istAt(-9, 15),
    },
    journey: [
      event(-9, MEERA, 'intake', 'Assigned from Inbound'), event(-9, OMKAR, 'intake-accepted', 'Accepted'),
      event(-6, OMKAR, 'meeting-held', 'Meeting 1 held'), event(-6, OMKAR, 'meeting-scheduled', 'Meeting 2 booked'),
    ],
  });

  const fromDraft = outreachRow(`OR-IN-${leadId(17)}`, 'Yet to Meet', istAt(-1, 10), {
    company: 'Draft Designs', contact_person: 'Dev Draft', phone: leadPhone(17), segment: '1', lead_type: 'Warm',
    company_type: 'Interior Designer', selections: ['Laminates', 'Others'], source: 'Inbound',
    requirement: 'Decision maker: Principal designer\nProject: Ten kitchens a month\nFrom Asha (Inbound): Factory visit welcome.',
    intake: {
      from: 'Inbound', inboundLeadId: String(leadId(17)), inboundOwner: ASHA.name, inboundStage: 'Connected - Need nurturing',
      assignedAt: istAt(-1, 10), assignedBy: MEERA.name,
    },
    journey: [event(-1, MEERA, 'intake', 'Assigned from Inbound')],
  });

  const handoverReady = {
    contact_person: 'Demo Owner A', segment: '2', company_type: 'Interior Designer', team_size: '6-15',
    office_address: 'Demo Tower, HSR Layout (sandbox)', source: 'Own research', order_value_source: 'deal', deal_status: 'Order Placed',
  };

  const mockup = outreachRow('OR-SBX-2001', 'Closed', istAt(-20, 10), {
    ...handoverReady, company: 'Mockup Interiors', phone: '9000020001', requirement: 'Laminates and panels for an office project',
    enq_id: 'ENQ-900103', order_value: 520000, converted_at: istAt(-4, 17), status_changed_at: istAt(-4, 17), new_onboarding: true,
    whatsapp_group_link: 'https://chat.whatsapp.com/SandboxDemoGroup01',
    meetings: [meeting(1, -15, 'Completed', { metWith: 'Owner / Principal', notes: 'Agreed to a trial order.' })],
    handover: {
      kam: KAVYA.name, kamPhone: KAVYA.phone, whatsappGroupLink: 'https://chat.whatsapp.com/SandboxDemoGroup01',
      sentAt: istAt(-1, 12), sentBy: OMKAR.name, status: 'Pending', note: 'First order delivered next week.',
    },
    journey: [
      event(-20, OMKAR, 'created', 'Created by Omkar (Outreach)'), event(-15, OMKAR, 'meeting-held', 'Meeting 1 held'),
      event(-4, OMKAR, 'order-verified', 'ENQ-900103 verified'), event(-1, OMKAR, 'handover-sent', 'Handover sent to Kavya (KAM)'),
    ],
  });

  const template = outreachRow('OR-SBX-2002', 'Closed', istAt(-40, 10), {
    ...handoverReady, contact_person: 'Demo Owner B', company: 'Template Builders', phone: '9000020002', company_type: 'Builder',
    requirement: 'Tiles for a 40-unit block', enq_id: 'ENQ-900104', order_value: 610000, deal_status: 'Delivered',
    converted_at: istAt(-25, 17), status_changed_at: istAt(-25, 17), new_onboarding: true, kam: KAVYA.name,
    whatsapp_group_link: 'https://chat.whatsapp.com/SandboxDemoGroup02',
    meetings: [meeting(1, -35, 'Completed', { metWith: 'Owner / Principal' })],
    handover: {
      kam: KAVYA.name, kamPhone: KAVYA.phone, whatsappGroupLink: 'https://chat.whatsapp.com/SandboxDemoGroup02',
      sentAt: istAt(-24, 12), sentBy: OMKAR.name, status: 'Accepted', respondedAt: istAt(-24, 16), respondedBy: KAVYA.name,
    },
    journey: [event(-24, OMKAR, 'handover-sent', 'Handover sent'), event(-24, KAVYA, 'handover-accepted', 'Kavya (KAM) signed off')],
  });

  return [fromSpecimen, fromDraft, mockup, template];
}

function clientRow(id, company, phone, source, created, meta) {
  const m = {
    company, contacts: [{ number: phone, name: meta.contactName, primary: true }], gsts: [], segment: '2',
    client_type: meta.clientType, client_type_raw: null, source,
    assignments: [{ kam: KAVYA.name, at: created, by: MEERA.name, reason: meta.reason }],
    remarks: null, interactions: meta.interactions ?? [], escalations: [], merged_from: [], created_at: created, updated_at: created,
  };
  return { id, pipeline: 'client', stage: 'Client', kylas_lead_id: null, owner: KAVYA.name, value: 0, created_at: created, updated_at: created, meta_data: m };
}

function kamRow(id, clientId, company, phone, stage, day, meta) {
  const created = istAt(day, 12);
  const m = {
    client_id: clientId, company, contact_name: null, phone, requirement: null, enq_id: null, order_value: null,
    order_value_source: null, deal_status: null, expected_closure: null, lost_reason: null, status_changed_at: created,
    source: 'Outreach', escalations: [], notes: [], created_at: created, estimated_value: null, ...meta,
  };
  return { id, pipeline: 'kam', stage, kylas_lead_id: null, owner: KAVYA.name, value: Number(m.order_value) || 0, created_at: created, updated_at: created, meta_data: m };
}

function seedKam() {
  const clients = [
    clientRow('CLI-SBX-0001', 'Template Builders', '9000020002', 'Outreach', istAt(-24, 16), {
      contactName: 'Demo Owner B', clientType: 'Builder', reason: 'Handover from Outreach',
      interactions: [{
        id: 'INT-SBX-0001', type: 'Call', date: istDay(-3), summary: 'Next block starts in December.', temperature: 4,
        upcomingProject: '60-unit block', nextFollowUpDate: istDay(4), loggedBy: KAVYA.name, createdAt: istAt(-3, 15),
      }],
    }),
    clientRow('CLI-SBX-0002', 'Exemplar Interiors', '9000020003', 'Existing', istAt(-90, 12), {
      contactName: 'Demo Owner C', clientType: 'Interior Designer', reason: 'Existing account',
    }),
  ];
  const orders = [
    kamRow('KAM-SBX-0001', 'CLI-SBX-0001', 'Template Builders', '9000020002', 'Closed', -30, {
      requirement: 'Tiles, block A', enq_id: 'ENQ-900104', order_value: 610000, order_value_source: 'deal', deal_status: 'Delivered',
    }),
    kamRow('KAM-SBX-0002', 'CLI-SBX-0001', 'Template Builders', '9000020002', 'Quote Shared', -3, {
      requirement: 'Tiles, block B', estimated_value: 300000,
    }),
    kamRow('KAM-SBX-0003', 'CLI-SBX-0002', 'Exemplar Interiors', '9000020003', 'Closed', -50, {
      requirement: 'Wallpaper refresh', enq_id: 'ENQ-900105', order_value: 180000, order_value_source: 'deal', deal_status: 'Delivered', source: 'Existing',
    }),
  ];
  return [...clients, ...orders];
}

function seedTeam(at) {
  const row = (p, team, inRotation) => ({
    phone: p.phone, name: p.name, team, kylas_user_id: p.kylasId ?? null, kylas_name: p.kylasId ? p.name : null,
    in_rotation: inRotation, active: true, is_admin: false, updated_at: at, updated_by: MEERA.name,
  });
  const bharat = PERSONAS.find((p) => p.phone === '9000000002');
  return [...PERSONAS.filter((p) => p.team).map((p) => row(p, p.team, true)), row(bharat, 'outreach', false)];
}

function seedEcVisits() {
  return [{
    id: 'ECV-SBX-0001', client_id: 'CLI-SBX-0001', firm: 'Template Builders', contact_name: 'Demo Owner B', phone: '9000020002',
    branch: 'Whitefield', visit_date: istDay(1), visit_time: '11:30', purpose: 'Pick laminates for the next block',
    status: 'Scheduled', bm_name: SNEHA.name, outcome: null, enq_id: null, scheduled_by: KAVYA.name,
    created_at: istAt(-1, 15), updated_at: istAt(-1, 15), updated_by: KAVYA.name,
  }];
}

function seedWaitlist() {
  const signup = (phone, firm_name, contact_name, day, status = 'new') => ({
    phone, firm_name, contact_name, city: 'Bengaluru', firm_type: 'architect', team_size: '2-5', status, created_at: istAt(day, 11),
  });
  return [
    signup('9000020001', 'Mockup Interiors', 'Demo Owner A', -3),
    signup('9000020099', 'Placeholder Atelier', 'Demo Walk-up', -1),
  ];
}

export function seedPipeline() {
  return {
    rows: [...seedOutreach(), ...seedKam()],
    deals: seedDeals(),
    team: seedTeam(istAt(-30, 10)),
    ecVisits: seedEcVisits(),
    waitlist: seedWaitlist(),
  };
}
