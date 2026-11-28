import { istToday } from '../inbound';
import { needsCheckIn } from '../outreach';
import { InteractionGateInput } from '../../types/kam';
export function interactionGateErrors(i: InteractionGateInput, today: string = istToday()): string[] {
  const errs: string[] = [];
  const day = String(i.date || '').slice(0, 10);
  if (!day) errs.push('Set the date the interaction took place.');
  else if (day > today) errs.push('An interaction cannot be dated in the future — set the next follow-up date instead.');
  if (i.type === 'Meeting' && !i.checkIn && needsCheckIn(day)) {
    errs.push('A meeting needs a check-in at the client\'s office first — use "Check in at a meeting" on this firm when you arrive.');
  }
  if (i.type === 'Meeting' && !String(i.summary || '').trim()) {
    errs.push('A meeting needs its minutes: what was discussed and what was agreed.');
  }
  if (i.type === 'Enquiry' && !String(i.summary || '').trim()) {
    errs.push('An enquiry needs what the client asked for.');
  }
  if (i.type !== 'Meeting' && !String(i.nextFollowUpDate || '').slice(0, 10)) {
    errs.push(`A next follow-up date is required on a logged ${i.type.toLowerCase()}.`);
  }
  const next = String(i.nextFollowUpDate || '').slice(0, 10);
  if (next && day && next < day) errs.push('The next follow-up date cannot be before the interaction itself.');
  return errs;
}

export function interactionPrompts(i: InteractionGateInput & { temperature?: number }): string[] {
  const prompts: string[] = [];
  if (i.type === 'Meeting' && !String(i.nextFollowUpDate || '').trim()) {
    prompts.push('No next follow-up date. This meeting will not appear in Today\'s Calls or the Follow-up Queue, and CRM adherence counts it as incomplete.');
  }
  if (i.type === 'Call' && !String(i.summary || '').trim()) prompts.push('No summary. §3.1 asks for one, and CRM adherence counts this call as incomplete.');
  if (typeof i.temperature !== 'number') prompts.push('No account temperature scored, so the account keeps its previous reading (§3.2).');
  return prompts;
}

