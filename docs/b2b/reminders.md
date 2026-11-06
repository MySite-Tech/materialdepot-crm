# Reminders (built 2026-11-06)

**Covers:** `components/b2b/models/reminders/` · `components/b2b/views/reminders/` ·
`hooks/use-reminders.ts` · `hooks/use-reminder-alerts.ts` · the follow-up time on
every follow-up form.

The user, 2026-11-06: Inbound, Outreach and KAM people are told "call me at 5 pm
on 8 November", so a follow-up needs a time as well as a date. **Every B2B person**
gets a Reminders tab holding all of their follow-ups. A timed one should reach
them an hour before.

## Data

| Figure | Comes from | Requests |
|---|---|---|
| Every reminder | `fetchB2BData()`: the one `/rows` read every B2B tab shares | 0 on top of the open tab within the 8 s cache, then 1 per 15 min while visible, and 1 after a save |
| Owner names for Inbound | `team.members` (already loaded by the shell) | 0 |

## What becomes a reminder

`buildReminders` is the one function behind the tab, the nav badge and the desktop
alert. Each source uses the rule its own tab already uses, so the counts agree:

| Kind | Included when | Owner test (the tab's own) |
|---|---|---|
| Inbound call-back | `awaitsFollowUp(l)` (moved from `views/inbound/utils.ts`, which the Due today and Overdue tiles read) and a follow-up date | `ownerId` = the person's Inbound Kylas id |
| Outreach follow-up | `OUTREACH_OPEN_STATUSES` and a follow-up date | `repOwns` (BM phone, then `sameRep`) |
| Outreach meeting | a `Scheduled` meeting with a date, on an open lead | same |
| KAM follow-up | the firm has a KAM and `nextFollowUp(interactions)` gives a date | `ownsFirm` |
| PI follow-up | `KAM_OPEN_STATUSES` and the order's own follow-up date | `sameRep(o.kam, …)` |

**Tied out on 2026-11-06** against `crm_real` (the GET-only copy of production):
516 reminders (403 Inbound, 34 Outreach, 32 meetings, 47 KAM, 0 PI). The Inbound
share matched the Inbound tiles exactly: 3 due today, 392 overdue.

A reminder is "actioned" the same way the tiles are. Logging the call or moving
the date moves it, and nothing is ticked off by hand. There is no dismiss button,
on purpose: dismissing would make the tab disagree with the Overdue tile.

## The time rules (IST wall clock)

`reminderState` in `models/reminders/utils.ts`, checked at every boundary by hand:

- **Timed:** `later` until 60 minutes before (`REMINDER_LEAD_MINUTES`), `soon`
  until the time, then `due` for the rest of that day, then `overdue` from midnight.
  A 5 pm call on 8 Nov is in **Due now** from 4:00 pm.
- **Untimed:** **Today, any time** all day, then `overdue`.
- **Coming up** lists later today plus the next 7 days. Missed lists the most
  recent first.
- The badge counts `soon + due + today` for the signed-in person only, never Missed.
  With 392 overdue Inbound leads on the books, a badge that counted them would
  never mean anything.

## The time is stored paired with its date

`follow_up_time` holds `2026-11-08T17:00`, not `17:00` (`pairTime` / `unpairTime`
in `lib/b2b/data/rows.ts`). A time whose date is not the row's `follow_up_date`
is read as no time.

Why: the CRM wrote a bare `HH:MM` until 2026-10-30, then stopped writing it, and
the column kept the old values. On 2026-11-06, 18 real rows (1 Inbound, 17
Outreach) still held one. Some, like 00:29, 02:56 and 04:37, were plainly noise,
and dates had moved since. Reading the bare column back would have pinned those
times to dates nobody gave a time for. With pairing, all 18 read as untimed, with
no migration, and any later path that moves a date without touching the time
(a script, a bulk write, a form that forgets) drops the time instead of carrying
it over. KAM interactions keep `nextFollowUpTime` in the same JSON entry as their
date, so they need no pairing. No backend change: `b2b_inbound` and `b2b_outbound`
already have the text column (0018), and KAM orders put it in `extra`.

## Where the time is typed

Beside every next-follow-up date, always optional and never gated: the Inbound
call log (Connected) and Move modal, the Outreach status card, meeting editor,
Move modal and new lead, the KAM interaction log and the PI modal. RNR still
books the next working day and clears any time. This **reverses the 2026-10-30
"no follow-up time" decision** (`inbound.md` §The call log) at the user's ask.

## Refresh, the badge and alerts

- **The hook lives in the B2B shell, not the tab.** That is the one deliberate
  exception to "fetch for the tab that is open": the badge and the alert must work
  while Inbound is open. It costs nothing on mount because it shares the open tab's
  `/rows` read inside `withB2BCache`'s 8 s. The exception is a person who lands on
  a tab that never reads `/rows` (My performance with no team), who pays one read.
- The clock ticks every 30 s (no request). Data reloads every 15 min while visible,
  on return to the page if older than that, and 1.5 s after any B2B write
  (`onB2BWrite`, fired by `invalidateB2BCache`). So a logged call leaves the list
  straight away. The user asked for hourly; 15 min keeps a colleague's change from
  taking an hour to show, for one request.
- **Desktop alerts are opt-in** ("Turn on desktop alerts", the browser's own
  permission). They fire once per reminder, for timed ones only, from an hour
  before until an hour after, so opening the page at 9 pm does not replay the
  day. Several at once become one alert. The "already alerted" marks are
  per-browser `localStorage`, so a second device alerts again.
- **They only fire while a CRM tab is open on B2B Sales.** There is no server
  push. A phone gets the alert through the PWA's service worker, which has no
  click handler, so tapping it opens nothing in particular.

## Who sees what

Everyone sees their own. A manager gets Mine / Everyone / each person (default
Mine if they are on a team, else Everyone). That is screen-only scoping, the
same as the other B2B tabs, by the 2026-10-31 decision.

**Open works on the Reminders tab itself (the user, 2026-11-06).** It used to
switch to the record's own tab; that was dropped, and the tabs no longer take an
`openId`. `ui/record.tsx` renders the same drawer each tab uses, with the same
props and save path: `InboundDrawer`, `OutreachDrawer` (its save runs
`withJourney` then `upsertOutreachLead`, and the saved lead becomes the next
save's "before", as on the Outreach tab), and for KAM and PI reminders the firm's
`ClientDrawer` with the interaction log, check-in and order modals
(`ui/kam-record.tsx`). That KAM wiring repeats the KAM tab's on purpose for now:
the KAM tab and drawer were being changed by another branch
(`b2b-firm-orders-ec-per-cart`), so extracting a shared component would have
collided with it. Extract it once that branch lands. Opening costs what the
drawer itself reads, plus one Studio waitlist read for Outreach and one
`b2b-bulk` for the firm's own numbers on KAM. The drawer keeps its record by id,
so a save that moves the reminder to another section, or off the list, leaves it
open.

## Not done

- The retail CRM's own follow-ups (Django leads) are not in this tab. Adding a time
  there needs Django.
- KAM's firm list and Overdue/Due today tiles still bucket by date only. The time
  shows in the drawer and on the Reminders tab.
- Seen only through the harness and on the sandbox, not signed in on real data.
  On the sandbox each kind opened in place, and a timed KAM call logged from the
  in-place drawer moved the firm into Due now.
