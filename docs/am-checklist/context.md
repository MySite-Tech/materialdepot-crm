# components/am-checklist

**Covers:** `components/am-checklist/**` · `lib/api/crm/am-checklist.ts`

## Purpose
The Assistant Manager's (AM) daily check on each BM who reports to them:
yesterday's closures (why not placed), priorities, follow-ups due, and a
6-point grooming check. The AM fills it in this tab; the BM sees their grooming
score on My Day in the app. Ported from the sales-floor mock `am-checklist.html`.

## Who sees which BMs
A BM belongs to an AM through `reports_to` on the BM's `UserOrganisation`
(Admin > Users > Edit, shown only when the role is Sales). The backend
(`order/crm/am_checklist/` in the Django repo) does all the gating: an
`assistant_manager` sees only their own BMs, `admin` / `manager` / `tech` see
every BM that has an AM, everyone else gets 403. The tab slug
`crm.am_checklist` only hides the tab; it is not what protects the data.

## Data

| Call | Endpoint |
|---|---|
| BM list for a day (chips, done count, WhatsApp image data) | `GET /am-checklist/bms/?date=&branch=` |
| One BM's day | `GET /am-checklist/bms/<id>/?date=` |
| Save answers | `PUT /am-checklist/bms/<id>/?date=` (partial: only the sections sent) |
| The BM's daily card (right column) | `GET /am-checklist/bms/<id>/daily-card/` |

Three requests on mount (list, day, card). GETs pass a signal so `mdFetch`
does not serve a cached list right after a save.

## Rules the backend enforces (and the UI mirrors)
- **Only today is editable.** Past days are read-only (409 on save); they read
  back what was saved on the row, not live tickets.
- **1 PM IST cutoff.** Before 1 PM the BM can still move closure / follow-up
  dates, so `cutoff.open` is false, the Closures and Follow-ups cards are
  replaced by `OpensAtCutoffCard`, saving them is a 409, and the to-do count is
  grooming only. At 1 PM a Celery job copies the lists into the day's row with
  empty answers; after that they do not change. "Placed" is still re-checked
  against orders until midnight.
- **Grooming** starts as six `null` answers; it is scored only once the AM
  saves it (`score != null`).
- A closure reason is also posted to the lead as a remark
  (`appendRemarkToLead`), best effort.

## WhatsApp image
`DaySummary` renders off-screen and `html-to-image` (`toPng`, dynamic import)
turns it into a PNG download. Before the cutoff it says "Opens at 1 PM" for
closures and follow-ups instead of showing empty-but-confident zeros.
