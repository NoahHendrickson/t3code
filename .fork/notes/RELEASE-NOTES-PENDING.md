# Pending release-note lines

Lines to fold into the next fork release's notes, then delete from here.
Each entry names the sync or PR that created the obligation.

- **v0.0.30 sync (PR #33):** Prompt stashes saved before this release are
  cleared on first launch. Upstream moved the stash store to a new
  storage key and deliberately deletes the old one at startup without
  migrating (localStorage quota rationale, `promptStashStore.ts`); the
  sync keeps that behavior. Users with stashed prompts they care about
  should send or copy them before upgrading.
