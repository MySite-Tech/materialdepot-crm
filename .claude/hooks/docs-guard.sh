#!/usr/bin/env bash
# Enforces two CLAUDE.md rules that text alone has not been enough to enforce:
#   1. "A code change is not done until its doc matches" (docs/<module>/context.md)
#   2. The request-budget egress and id rules (.claude/skills/request-budget)
#
# Three callers, three diff scopes:
#   claude    (default) Claude Code Stop hook. Working tree + commits ahead of
#             upstream. Exit 2 = "you may not finish yet", stderr goes to Claude.
#   precommit .githooks/pre-commit. Staged changes only. Exit 1 blocks the commit.
#   ci        .github/workflows/docs-guard.yml. BASE...HEAD. Exit 1 fails the job.
#
# Usage: docs-guard.sh [claude|precommit|ci] [base-ref]

set -uo pipefail

MODE="${1:-claude}"
BASE="${2:-origin/main}"

if [ "$MODE" = "claude" ]; then
  payload="$(cat 2>/dev/null || true)"
  # Already re-prompted once by this hook — let the turn end rather than loop.
  if printf '%s' "$payload" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
    exit 0
  fi
fi

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$root" || exit 0

case "$MODE" in
  precommit)
    changed="$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)"
    ;;
  ci)
    git rev-parse --verify -q "$BASE" >/dev/null || { echo "docs-guard: base '$BASE' not found" >&2; exit 0; }
    changed="$(git diff --name-only --diff-filter=ACMR "$BASE...HEAD" 2>/dev/null)"
    ;;
  *)
    # The rule is "same commit", so look at the whole unpushed delta, not just
    # the working tree — code committed this session still needs its doc.
    uncommitted="$(git status --porcelain=v1 2>/dev/null | awk '{ $1=""; sub(/^ +/,""); print }' | sed 's/.* -> //')"
    # A branch with no upstream still needs its commits checked, or a fresh
    # local branch would only ever be measured on its working tree.
    committed=""
    up="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)" || up=""
    [ -z "$up" ] && git rev-parse --verify -q "$BASE" >/dev/null && up="$BASE"
    [ -n "$up" ] && committed="$(git diff --name-only "$up...HEAD" 2>/dev/null)"
    changed="$(printf '%s\n%s\n' "$uncommitted" "$committed")"
    ;;
esac

changed="$(printf '%s\n' "$changed" | grep -v '^$' | sort -u)"
[ -z "$changed" ] && exit 0

fail=0
report=""
note() { report="${report}
$1"; fail=1; }

# ---------- 1. docs parity ----------
# "<code path prefix>|<docs path that must also change>|<human label>"
MODULES="
components/b2b/|docs/b2b/|B2B sales CRM
lib/b2b/|docs/b2b/|B2B sales CRM
lib/api/b2b/|docs/b2b/|B2B sales CRM
lib/api/core/|docs/api-layer/|Django/Kylas client layer
lib/api/crm/|docs/api-layer/|Django/Kylas client layer
lib/server/|docs/api-layer/|Django/Kylas client layer
components/site-audit/|docs/site-audit/|Site audit
components/crm/shell/|docs/crm-shell/|App shell / auth / tabs
components/footfall/|docs/footfall/|Footfall
components/nps/|docs/nps/|NPS
components/report-card/|docs/report-card/|Report card
lib/org/|docs/org-hierarchy/|Store hierarchy
components/weekly-funnel/|docs/weekly-funnel/|Weekly funnel
components/appointment-tracker/|docs/appointment-tracker/|Appointment tracker
components/store-visit/|docs/store-visit/|Store visit
components/store-checklist/|docs/store-checklist/|Store checklist
lib/store-checklist/|docs/store-checklist/|Store checklist
app/api/store-checklist/|docs/store-checklist/|Store checklist
components/store-display/|docs/store-display/|Store display
components/sales-dashboard/|docs/sales-dashboard/|Sales dashboard
components/dashboard/|docs/dashboard/|Retail overview
"

seen_docs=""
while IFS='|' read -r code docs label; do
  [ -z "${code:-}" ] && continue
  printf '%s\n' "$changed" | grep -q "^${code}" || continue
  printf '%s\n' "$changed" | grep -q "^${docs}" && continue
  case " $seen_docs " in *" $docs "*) continue ;; esac
  seen_docs="$seen_docs $docs"
  note "  [docs] ${label}: ${code} changed, nothing under ${docs} did"
done <<< "$MODULES"

# Guards the guard: a docs/ rename silently un-matches a MODULES row.
while IFS='|' read -r code docs label; do
  [ -z "${docs:-}" ] && continue
  [ -d "$docs" ] && continue
  case " $seen_docs " in *" missing:$docs "*) continue ;; esac
  seen_docs="$seen_docs missing:$docs"
  note "  [config] ${docs} does not exist — the MODULES row for ${label} matches nothing.
           Fix the path in .claude/hooks/docs-guard.sh."
done <<< "$MODULES"

# ---------- 2. coding practices on changed source files ----------
src="$(printf '%s\n' "$changed" | grep -E '^(components|lib|app)/.*\.(ts|tsx)$' || true)"
if [ -n "$src" ]; then
  existing=""
  while IFS= read -r f; do [ -f "$f" ] && existing="${existing}${f}
"; done <<< "$src"

  if [ -n "$existing" ]; then
    hits="$(printf '%s' "$existing" | tr '\n' '\0' | xargs -0 grep -lE "axios|XMLHttpRequest|new WebSocket" 2>/dev/null || true)"
    [ -n "$hits" ] && note "  [egress] axios/XHR/WebSocket in: $(printf '%s' "$hits" | tr '\n' ' ')
           Only mdFetch, kylasFetch, sbGet/sbGetPaged/supabase.from, and app/api/* are allowed."

    hits="$(printf '%s' "$existing" | tr '\n' '\0' | xargs -0 grep -lE '`[A-Za-z]+-\$\{Date\.now\(\)\}`' 2>/dev/null || true)"
    [ -n "$hits" ] && note "  [ids] timestamp-only record id in: $(printf '%s' "$hits" | tr '\n' ' ')
           Use newB2BId(prefix) — these collide and silently overwrite a row."
  fi
fi

[ "$fail" -eq 0 ] && exit 0

{
  echo "Repo rules not satisfied (.claude/hooks/docs-guard.sh, mode: $MODE):"
  echo "$report"
  echo
  echo 'For [docs] — CLAUDE.md: "A code change is not done until its doc matches."'
  echo "  Update the module's context.md / part file to record WHY, not what, and add"
  echo "  a docs/landmines.md entry if you fixed a bug whose shape could recur."
  echo "  Removing a now-wrong line counts as much as adding a true one."
  echo
  echo "For [egress]/[ids] — see .claude/skills/request-budget/SKILL.md."
  case "$MODE" in
    claude)
      echo
      echo "  If the change genuinely alters nothing any doc describes (rename, type-only,"
      echo "  pure refactor), say so explicitly in your reply and finish."
      echo
      echo "Also confirm before finishing, since no automated check covers these:"
      echo "  - Requests on mount still within the ten-request budget for the tab you touched."
      echo "  - No request inside a loop over rows (use a bulk endpoint)."
      echo '  - A failed request renders "unknown", never a confident zero.'
      echo "  - npx tsc --noEmit and npm run build both pass."
      ;;
    precommit)
      echo
      echo "  Stage the doc change too, then commit again."
      echo "  Genuinely doc-neutral (rename, type-only, pure refactor)? git commit --no-verify"
      ;;
    ci)
      echo
      echo "  Push a commit that updates the doc, or add the 'docs-neutral' label to the PR."
      ;;
  esac
} >&2

[ "$MODE" = "claude" ] && exit 2
exit 1
