import { istToday } from '../inbound';
import { InteractionGateInput, KamOrderGateInput, KamOrderStatus } from '../../types/kam';
export function kamOrderGateErrors(o: KamOrderGateInput): string[] {
  const errs: string[] = [];
  if (!String(o.company || '').trim()) errs.push('Pick the client this order is for.');
  if (o.status === 'PI Shared' && !String(o.enqId || '').trim()) {
    errs.push('An Enquiry ID is required to set PI Shared — §5.2 fetches the order value with it.');
  }
  if (o.status === 'Lost' && !String(o.lostReason || '').trim()) {
    errs.push('A lost reason is required to set Lost.');
  }
  return errs;
}

export function kamOrderStatusPrompts(o: {
  status: KamOrderStatus;
  enqId?: string;
  orderValue?: number;
  expectedClosure?: string;
  requirement?: string;
}): string[] {
  const prompts: string[] = [];
  if (o.status === 'Quote Shared') {
    prompts.push('§5.2 expects no Enquiry ID yet at Quote Shared. PRD open question #4 asks whether this status should also demand a next follow-up date — it does not today.');
  }
  if (o.status === 'Closed' && !String(o.enqId || '').trim()) {
    prompts.push('Add the Enquiry ID — without it the closure value cannot be read from the deal ticket and this order counts as ₹0 revenue.');
  }
  if ((o.status === 'PI Shared' || o.status === 'Closed') && String(o.enqId || '').trim() && !o.orderValue) {
    prompts.push('The Enquiry ID has not resolved to a deal ticket yet, so no order value is on file.');
  }
  if (!String(o.requirement || '').trim()) prompts.push('No requirement details captured (§5.1).');
  if (!o.expectedClosure && o.status !== 'Closed' && o.status !== 'Lost') {
    prompts.push('No expected date of closure set (§5.1).');
  }
  return prompts;
}

export function interactionGateErrors(i: InteractionGateInput, today: string = istToday()): string[] {
  const errs: string[] = [];
  const day = String(i.date || '').slice(0, 10);
  if (!day) errs.push('Set the date the call or meeting took place.');
  else if (day > today) errs.push('An interaction cannot be dated in the future — set the next follow-up date instead.');
  if (i.type === 'Call' && !String(i.nextFollowUpDate || '').slice(0, 10)) {
    errs.push('A next follow-up date is required on a logged call (§4.1).');
  }
  const next = String(i.nextFollowUpDate || '').slice(0, 10);
  if (next && day && next < day) errs.push('The next follow-up date cannot be before the interaction itself.');
  return errs;
}

export function interactionPrompts(i: InteractionGateInput & { summary?: string; temperature?: number }): string[] {
  const prompts: string[] = [];
  if (i.type === 'Meeting' && !String(i.nextFollowUpDate || '').trim()) {
    prompts.push('No next follow-up date. §4.1 only requires one on a call, so this meeting will not appear in Today\'s Calls or the Follow-up Queue.');
  }
  if (!String(i.summary || '').trim()) prompts.push('No summary — §3.1 asks for one.');
  if (typeof i.temperature !== 'number') prompts.push('No account temperature scored, so the account keeps its previous reading (§3.2).');
  return prompts;
}

