#!/usr/bin/env bash
# PreToolUse (Edit|Write): turns "docs/ is read on demand" into "the doc is in
# context before the first edit". Fires ONCE per session per module, so it
# informs without nagging. Never blocks — it only injects context.

set -uo pipefail

payload="$(cat 2>/dev/null || true)"
[ -z "$payload" ] && exit 0

read_json() { printf '%s' "$payload" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1; }

file="$(read_json 'file_path')"
[ -z "$file" ] && exit 0

session="$(read_json 'session_id')"
[ -z "$session" ] && session="nosession"

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
rel="${file#"$root"/}"

# "<code path prefix>|<docs dir>|<human label>"
MODULES="
components/b2b/|docs/b2b|B2B sales CRM
lib/b2b/|docs/b2b|B2B sales CRM
lib/api/b2b/|docs/b2b|B2B sales CRM
components/site-audit/|docs/site-audit|Site audit
components/crm/shell/|docs/crm-shell|App shell / auth / tabs
components/footfall/|docs/footfall|Footfall
components/nps/|docs/nps|NPS
components/report-card/|docs/report-card|Report card
components/weekly-funnel/|docs/weekly-funnel|Weekly funnel
components/appointment-tracker/|docs/appointment-tracker|Appointment tracker
components/store-visit/|docs/store-visit|Store visit
components/store-display/|docs/store-display|Store display
components/sales-dashboard/|docs/sales-dashboard|Sales dashboard
components/dashboard/|docs/dashboard|Retail overview
lib/api/|docs/api-layer|Django/Kylas client layer
"

docs=""; label=""
while IFS='|' read -r code d l; do
  [ -z "${code:-}" ] && continue
  case "$rel" in "$code"*) docs="$d"; label="$l"; break ;; esac
done <<< "$MODULES"

[ -z "$docs" ] && exit 0
[ -d "$root/$docs" ] || exit 0

# Once per session per module.
mark_dir="${TMPDIR:-/tmp}/claude-docs-brief"
mkdir -p "$mark_dir" 2>/dev/null
mark="$mark_dir/$(printf '%s|%s' "$session" "$docs" | tr -c 'A-Za-z0-9' '_')"
[ -f "$mark" ] && exit 0
: > "$mark"

parts="$(cd "$root" && ls "$docs"/*.md 2>/dev/null | tr '\n' ' ')"
[ -z "$parts" ] && exit 0

msg="You are about to edit ${label} (${rel}), which is documented.

Read these BEFORE changing behaviour — they record why things are the way they
are, what breaks if you change them, and what was already tried and failed:
  ${parts}
  docs/landmines.md  (grep it for the file or symbol you are touching)

CLAUDE.md: a code change is not done until its doc matches. If you change
behaviour these docs describe, update them in the SAME commit — a Stop hook and
a pre-commit hook both check this, and the PR check will fail otherwise.

This notice fires once per module per session."

esc="$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null)"
[ -z "$esc" ] && exit 0

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":%s}}\n' "$esc"
exit 0
