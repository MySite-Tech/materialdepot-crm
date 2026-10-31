import { dealIsOpen, dealIsOrder } from '../../../components/b2b/models/client';
import type { CRMLeadRow } from '../../api/crm/leads';

export interface ClientOrderRow {
  enqId: string;

  contactNumber: string;
  contactName: string;

  companyOnOrder?: string;
  gstOnOrder?: string;
  orderValue: number;
  status: string;
  ordered: boolean;
  lost: boolean;
  open: boolean;


  createdAt?: string;

  spoc?: string;
  branch?: string;
  cart: CartLine[];
  lostReason?: string;

  ticketId?: number;
  cartValueExclGst?: number;
  clientType?: string;
  propertyType?: string;
  architectInvolved?: boolean;
  projectPhase?: string;
  followUpDate?: string;
  closureDate?: string;
  lostMarkDate?: string;
  visits: CRMLeadRow['visits'];
  remarks: CRMLeadRow['remarks'];
}

export interface CartLine {
  name: string;
  qty?: number;
  price?: number;
}

function cartLines(v: unknown): CartLine[] {
  if (Array.isArray(v)) {
    return v
      .map((i) => (typeof i === 'string' ? { name: i } : { name: String(i?.name || ''), qty: Number(i?.qty) || undefined, price: Number(i?.price) || undefined }))
      .filter((i) => i.name.trim());
  }
  return String(v || '').split('\n').map((name) => ({ name: name.trim() })).filter((i) => i.name);
}

export function ticketToOrderRow(t: CRMLeadRow, phone: string): ClientOrderRow {
  const ordered = dealIsOrder(t.status);
  return {
    enqId: String(t.id || ''),
    contactNumber: phone,
    contactName: String(t.clientName || '').trim(),
    companyOnOrder: undefined,
    gstOnOrder: undefined,
    orderValue: Number(t.cartValue) || 0,
    status: String(t.status || ''),
    ordered,
    lost: !ordered && !dealIsOpen(t.status),
    open: dealIsOpen(t.status),
    createdAt: String(t.createdAt || '').slice(0, 10) || undefined,
    spoc: String(t.assignedTo || '').trim() || undefined,
    branch: String(t.branch || '').trim() || undefined,
    cart: cartLines(t.cartItems),
    lostReason: String(t.lostReason || '').trim() || undefined,
    ticketId: t.ticketId,
    cartValueExclGst: t.cartValueExclGst !== undefined && t.cartValueExclGst !== null ? Number(t.cartValueExclGst) || 0 : undefined,
    clientType: String(t.clientType || '').trim() || undefined,
    propertyType: String(t.propertyType || '').trim() || undefined,
    architectInvolved: typeof t.architectInvolved === 'boolean' ? t.architectInvolved : undefined,
    projectPhase: String(t.projectPhase || '').trim() || undefined,
    followUpDate: String(t.followUpDate || '').slice(0, 10) || undefined,
    closureDate: String(t.closureDate || '').slice(0, 10) || undefined,
    lostMarkDate: String(t.lostMarkDate || '').slice(0, 10) || undefined,
    visits: Array.isArray(t.visits) ? t.visits : [],
    remarks: Array.isArray(t.remarks) ? t.remarks : [],
  };
}
