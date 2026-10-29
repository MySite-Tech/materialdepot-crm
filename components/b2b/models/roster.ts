export type RepRole = 'KAM' | 'Inbound' | 'Outbound' | 'Admin';

export interface B2BRep {

  name: string;
  fullName: string;

  contact?: string;
  role: RepRole;

  vertical?: string;

  assignable: boolean;
}

export const B2B_ROSTER: B2BRep[] = [
  { name: 'Krishna Bhagavatula', fullName: 'Krishna Bhagavatula', role: 'Admin', assignable: true },

  { name: 'Tharun',    fullName: 'Tharun',              contact: '8309230101', role: 'KAM',      vertical: 'Bangalore KAM', assignable: true },
  { name: 'Jadhav',    fullName: 'Krishna Jadhav',      contact: '9187200807', role: 'KAM',      vertical: 'Bangalore KAM', assignable: true },
  { name: 'Sidhant',   fullName: 'Sidhant',                                    role: 'KAM',                                 assignable: true },
  { name: 'Sai Suresh', fullName: 'Sai Suresh',         contact: '9187953228', role: 'KAM',                                 assignable: true },

  { name: 'Hardi',     fullName: 'Hardi Patel',         contact: '9187191018', role: 'Inbound',  vertical: 'Inbound',       assignable: true },
  { name: 'Mandeep',   fullName: 'Mandeep Ghai',        contact: '7223048042', role: 'Inbound',  vertical: 'Inbound',       assignable: true },

  { name: 'Vilok',     fullName: 'Vilok Reddy',         contact: '9980123308', role: 'Outbound', vertical: 'Outreach',      assignable: true },
  { name: 'Praful',    fullName: 'Prafful Bhati',       contact: '8233435000', role: 'Outbound', vertical: 'Outreach',      assignable: true },

  { name: 'Manikanta', fullName: 'Manikanta',           contact: '9059903118', role: 'KAM',      vertical: 'HYD',           assignable: true },
  { name: 'Shahrukh',  fullName: 'Shahrukh Irshad Ali', contact: '9187200815', role: 'KAM',      vertical: 'HYD',           assignable: true },
];

export const B2B_ADMINS: string[] = B2B_ROSTER.filter((r) => r.role === 'Admin').map((r) => r.name);

export const ASSIGNABLE_REPS: string[] = B2B_ROSTER.filter((r) => r.assignable).map((r) => r.name);

export const KAMS: string[] = ASSIGNABLE_REPS;

export const B2B_REPS: string[] = ASSIGNABLE_REPS;

export const DEFAULT_ASSIGNEE = ASSIGNABLE_REPS[0];

export const DEFAULT_KAM = KAMS[0];

export const B2B_VERTICALS: { label: string; reps: { name: string; contact: string }[] }[] = [
  ...new Map(
    B2B_ROSTER
      .filter((r): r is B2BRep & { vertical: string; contact: string } => !!r.vertical && !!r.contact)
      .map((r) => [r.vertical, { label: r.vertical, reps: [] as { name: string; contact: string }[] }]),
  ).values(),
].map((v) => ({
  ...v,
  reps: B2B_ROSTER
    .filter((r) => r.vertical === v.label && r.contact)
    .map((r) => ({ name: r.fullName, contact: r.contact as string })),
}));

export const REP_ROLE_COLORS: Record<RepRole, string> = {
  KAM:      '#0F766E',
  Inbound:  '#3B82F6',
  Outbound: '#EAB308',
  Admin:    '#6B7280',
};
