# Partner Content — what we publish onto partner dashboards

**Covers:** `components/b2b/views/partner-content/** · lib/b2b/content/** · app/api/b2b/partner-content`

The B2B Sales sub-tab where the team writes the banner across an architect's
Overview and the entries in their **New Launches** tab. Shipped 2026-09-22.

## Data

| Call | Endpoint | Notes |
|---|---|---|
| `fetchPartnerContent()` | `GET /api/b2b/partner-content` | Relays to the partner app's `GET /api/sync/content`. Returns **drafts and expired rows too** — RLS hides those from a partner, and the composer needs them |
| `pushPartnerContent()` | `POST /api/b2b/partner-content` | Relays to `POST /api/sync/content`. Upsert on `md_ref`, plus an explicit `remove` list |

**One request on mount**, and one per push. Nothing polls.

Both need `PARTNER_APP_BASE_URL` and `PARTNER_SYNC_SECRET`, the same pair the
partner bridge uses (`partner-bridge.md`). Neither is set in any Azure portal
yet, so this tab answers *"PARTNER_APP_BASE_URL is not set on this deployment"*
in production until somebody sets them. That is deliberate — a 503 naming the
variable beats a blank screen.

## This CRM stores none of it

There is no table here, no draft store, no second copy. The partner app is the
record, and this tab is a window onto it: read on open, edit in React state,
push the difference. That is why "Reload" is a visible button and why the
row list can disagree with the server until you press push.

The alternative — a CRM-side drafts table that syncs — buys an offline draft
and costs a second source of truth for what an architect is currently being
shown. When those two disagree, the only way to find out is to ask a partner
what is on their screen.

## The push is a diff, and omission is never deletion

Only rows that differ from what was read back are sent, so pressing push twice
does nothing. Removing a row puts its `md_ref` in `remove`; a row simply left
out of the payload is **not** touched. That is the opposite of the client-push
button in `client-db.md`, which is all-or-nothing, and it is deliberate: this
composer will eventually paginate, and a page-two push that wiped page one is
the shape of an outage.

## A pending chip says what WILL happen, not what is

A row you have edited but not pushed showed *"On partner dashboards now"* and
*"Not pushed"* side by side during the first browser pass — two chips
contradicting each other, on a row that had never existed on a partner
dashboard at all. The state chip now switches to `STATE_PENDING` while a row is
dirty: **"Not pushed — will go live"**, "— will be scheduled", "— stays
unpublished".

The shape worth remembering: a status derived from a row's own fields describes
the row's *intent*. Rendering it beside an unsynced row states that intent as a
present fact about somebody else's screen.

## Validation is duplicated on purpose, and it is not the gate

`problemWith()` runs in the editor so the Keep button can be disabled with a
sentence attached; `checkRow()` runs in the route so nothing reaches the
partner app on the word of a form. They check the same three things — a title,
a link that is `https://` or a rooted path, an end date after a start date —
and the route also rejects an unknown tone or launch kind, because those reach
the partner app as `className` and `CHECK` respectively.

The real gate is further down still: `lib/domain/content.ts` on the partner side
drops any tone or kind it does not recognise rather than writing it, and the
database has its own `CHECK`. Three layers, each of which is allowed to be
wrong on its own.

## Images go as bytes, not as a link

The picker reads a file into a `data:` URL and the push carries it as
`image_data`. The partner app writes it into its own `studio-media` bucket and
sets `image_url`. Nothing in this CRM stores the image, and no image is uploaded
until push — the label under the picker says so, because a file chosen and then
abandoned must not leave an orphan in somebody else's storage.

A failed image skips **its own row** and comes back in `skipped`, which the
green outcome panel lists. A push that quietly dropped four banners because
their pictures were too large is the failure that panel exists to prevent.

## Banners and launches are not the same thing

A **banner** has a run (`starts_on` / `ends_on`) and is wrong the day after it
ends. A **launch** is a catalogue entry — no start date, and an `ends_on` only
for the things that genuinely stop, an offer or an event. The partner side
keeps them in two tables for that reason; `docs/launches.md` in the
`Studio-Sales` repo has the argument.

## What the partner sees, and when

Nothing until it is both **pushed** and **published**, and — for a banner —
inside its dates. `is_published` false is a real value that is written, not a
dropped field: unpublishing and pushing is how something comes down without
being deleted.

## The partner app's 012 is applied; the env vars here are not set

`supabase/migrations/012_partner_content.sql` in `Studio-Sales` creates the two
tables, and it was **pasted on 2026-09-22** — the partner side of this is live,
the tables are empty, and the RLS gate was probed with real attempted writes.

What still stops this tab working in production is nearer home:
`PARTNER_APP_BASE_URL` and `PARTNER_SYNC_SECRET` are set in no Azure portal, so
it answers *"PARTNER_APP_BASE_URL is not set on this deployment"* until
somebody sets them. They are the same pair the partner bridge has been waiting
on (`partner-bridge.md`), and the secret must **equal** the partner app's
`SYNC_SHARED_SECRET` or every call is a 401 that reads like a code bug.

Before 012 was pasted, every call came back with the partner app's own sentence
naming that file, shown verbatim in the red panel with the line that nothing
was changed and a push is safe to repeat. That was read on screen on
2026-09-22 rather than assumed, and the branch is still live: a preview
deployment can point at a project without 012.
