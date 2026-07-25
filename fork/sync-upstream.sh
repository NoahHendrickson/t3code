#!/usr/bin/env bash
#
# Sync this fork with pingdotgg/t3code.
#
#   main  -- pristine mirror of upstream, never commit here
#   ui    -- your UI work, kept current by merging main into it
#
# Merge (not rebase) is deliberate: rebase replays your commits on every sync,
# so you re-resolve the same conflicts forever. Merge resolves each one once.
# rerere is enabled in this clone, so even repeat conflicts are remembered.
#
# Usage: ./fork/sync-upstream.sh

set -euo pipefail

FORK_BRANCH="${FORK_BRANCH:-ui}"
cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty. Commit or stash first." >&2
  exit 1
fi

START_BRANCH="$(git branch --show-current)"
echo "==> Fetching upstream"
git fetch upstream --prune

PREV="$(git rev-parse main)"
NEW="$(git rev-parse upstream/main)"

if [[ "$PREV" == "$NEW" ]]; then
  echo "==> Already up to date with upstream/main ($(git rev-parse --short "$NEW"))"
  exit 0
fi

echo "==> Advancing main: $(git rev-parse --short "$PREV") -> $(git rev-parse --short "$NEW")"
git checkout main --quiet
# Fast-forward only. If this fails, something was committed to main by mistake.
git merge --ff-only upstream/main
git push origin main --quiet && echo "    pushed main to origin"

echo
echo "==> Upstream commits landing in this sync: $(git rev-list --count "$PREV..$NEW")"
echo "==> Churn in apps/web (your reskin surface):"
git diff --stat "$PREV..$NEW" -- apps/web/src | tail -25 || true

echo
echo "==> Files you have modified that upstream also touched (conflict candidates):"
YOURS="$(git diff --name-only main..."$FORK_BRANCH" || true)"
THEIRS="$(git diff --name-only "$PREV..$NEW")"
OVERLAP="$(comm -12 <(echo "$YOURS" | sort -u) <(echo "$THEIRS" | sort -u) || true)"
if [[ -z "$OVERLAP" ]]; then
  echo "    none - clean merge expected"
else
  echo "$OVERLAP" | sed 's/^/    /'
fi

echo
echo "==> Merging main into $FORK_BRANCH"
git checkout "$FORK_BRANCH" --quiet
if git merge main --no-edit; then
  echo
  echo "==> Sync complete. Review the UI, then: git push origin $FORK_BRANCH"
else
  echo
  echo "==> Conflicts to resolve:"
  git diff --name-only --diff-filter=U | sed 's/^/    /'
  cat <<'EOF'

    Resolve, then:
      git add <files> && git commit --no-edit

    To bail out entirely:
      git merge --abort

    rerere recorded these resolutions, so an identical conflict next
    sync will be pre-resolved for you.
EOF
  exit 1
fi

if [[ "$START_BRANCH" != "$FORK_BRANCH" && -n "$START_BRANCH" ]]; then
  echo "    (you started on '$START_BRANCH'; now on '$FORK_BRANCH')"
fi
