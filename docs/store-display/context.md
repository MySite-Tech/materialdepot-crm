# components/store-display

**Covers:** `components/store-display/**` · `lib/store-display/**` · `app/api/store-display/route.ts`

## Purpose
Store product display management: what is physically on display in each store,
the add/move/remove movement workflow, discontinued and removed lists, movement
status tracking, an admin view and a per-product detail page.

## Who sees the Admin section

Two levels, rendered from one prop: `tab-panels.tsx` passes
`isAdmin={canAdminStoreDisplay(currentUser)}` — Full includes the Admin section,
Partial does not. The editor in Admin > Users shows them as the
"STORE DISPLAY ACCESS (PICK ONE)" radio.

`canAdminStoreDisplay` reads the **slug** `crm.store_display_admin` when the user
has any individual permissions, and only falls back to
`STORE_DISPLAY_ADMIN_ROLES` (`superadmin` · `admin` · `manager`) when that list
is empty. `tech` was in that set until 2026-09-11 and was removed: it is the
`permission_name` of a **Service Manager**, not an administrator (see
`docs/crm-shell/context.md` on `permission_name` being an HR label).

**The consequence that catches people: the role set is only a fallback.** An
`admin` whose permission list is non-empty and does not contain the slug gets
Partial, and widening the role set does not reach them — at the time of the
`tech` removal five admins/managers were in exactly that state, and five `tech`
accounts still carried the slug and kept Full. Changing the set fixes new users,
role re-picks and empty-list accounts only; anyone else has to be re-saved in
Admin > Users. This is the same force-add-vs-slug drift recorded in
`docs/landmines.md`.

## Data

All Django, via `lib/store-display/display-api.ts`:

| Call | Endpoint |
|---|---|
| `fetchLocations` | `GET /fetch-variant-locations/` (paged) |
| `getEcProducts` | `POST /fetch-variant-locations/` with `{ branch_name }` |
| `fetchFacets` | `GET /variant-location-facets/` → categories + display types |
| `initiateMovement` | `POST /v2/initiate-variant-store-movement/` |
| `fetchMovements` | `GET /v2/initiate-variant-store-movement/` |
| `completeMovement` | `POST /v2/complete-variant-store-movement/` |
| `cancelMovement` | `POST /cancel-variant-store-movement/` |
| `deleteLocations` | `POST /delete-variant-store-locations/` |
| `bulkUploadLocations` / `bulkChangeInitiate` / `bulkChangeComplete` | Google-Sheet-driven bulk endpoints |

`app/api/store-display/route.ts` (347 lines, the largest route handler here) sits
in front of some of this for the store-facing view.

**Note the same path is both GET and POST with different meanings:**
`/fetch-variant-locations/` GET is the paged, filtered read; POST with
`{ branch_name }` returns a branch's whole EC product set.
`/v2/initiate-variant-store-movement/` GET *lists* movements while POST *creates*
one.

## Shapes

`flattenLocationRow` collapses the nested response
(`row.location`, `row.variant`, `row.variant.variant_image[0]`) into one flat
object. Two `is_*` flags come from different levels and mean different things:
**`is_active` is the location's** (is it on display) while **`is_deleted` is the
variant's** (is the product gone). Defaults are `is_active: true` and
`is_deleted: false` when absent.

`fetchLocations` defaults to page 1 / page_size 30, and maps the caller's
`search` onto the **`product_name`** query param — searching by SKU through that
field will not match. The response may carry `truncated` and `scanned`, which is
how the backend signals it stopped short of a full scan.

Movement types are `add_display` | `move_display` | `remove_display`; a removal
carries `removal_reason` of `discontinued_permanently` or
`retired_from_store_display`. Lifecycle is initiate → complete or cancel.

## The store/branch id map is hardcoded

`lib/store-display/display-supabase.ts` (a misleading filename — it contains no
Supabase client, only constants) holds `STORE_CODE_TO_BRANCH_ID` and its inverse:

`JP_ec`→1, `YE_ec`→2, `WF_ec`→36, `KP_ec`→71, `HSR_ec`→104, `GB_ec`→69,
`BN_ec`→137.

Those numeric branch ids are Django's and are not sequential. A new store needs
this map edited by hand.

**Branch names here disagree with the appointment tracker's** for the same two
stores: `"HSR Layout"` vs `"HSR"`, and `"Basaveshwara Nagar"` vs
`"Basaveshwar Nagar"` (note the extra `a`). Never join those two lists on name —
go through the store code or the branch id.

## Images go through a transform proxy

`getImageUrl(url, height)` in `lib/store-display/image-url.ts` rewrites an origin
URL to `${TRANSFORM_BASE}/<bucket>/<objectPath>?height=…`, where the bucket is
chosen by matching the URL's host against a 13-entry table (`main` vs `content`).
Behaviour worth knowing:

- `format=webp` is added for every bucket **except `content`**.
- `.mp4`, `.mov`, `.gif` and `.svg` are returned untouched.
- A URL already on the transform base is returned as-is, so the function is
  idempotent.
- A host not in the table is returned unchanged — a new CDN silently skips
  resizing rather than breaking.
- `+` in the object path is re-encoded to `%20`; the query string is dropped.

`TRANSFORM_BASE` reads `NEXT_PUBLIC_IMAGE_TRANSFORM_BASE`, defaulting to
`https://image-transform.materialdepot.com`. That variable is **not** in the env
file, so the default is what runs.
