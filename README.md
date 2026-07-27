# rerere cache

`git rerere` resolution records for this fork's upstream syncs, kept on a branch so the
automated sync routine can restore them instead of re-solving conflicts it has already seen.

This branch holds the contents of `.git/rr-cache` — one directory per recorded conflict,
each with a `preimage` (the conflict as git presented it) and a `postimage` (how it was
resolved). It is an orphan branch: it shares no history with `custom` and carries no source.

Restore at the start of a sync run:

    git fetch origin fork/rerere-cache
    git archive origin/fork/rerere-cache | tar -x -C "$(git rev-parse --git-common-dir)/rr-cache" --exclude README.md

Save back after resolving conflicts, so the next run inherits the work.

See `.fork/README.md` §5 Layer 2.
