# Working with threads

Use a new thread for a separate task. Choose **New worktree** when its code changes
need a separate branch and working directory.

## Start a thread

On web and desktop, a new thread keeps the current project and carries your model
and mode selections, unless the destination project has its own model default.
Its branch and workspace mode come from your configured defaults. To continue in
an existing worktree, use **New thread in this worktree** from the branch toolbar.

When you change a new thread's project, T3 Code stays in the current environment
if that project exists there. Otherwise it selects an environment that has it.

### Start in the background

In a desktop browser or the desktop app, press `Cmd+Enter` on macOS or `Ctrl+Enter`
on Windows and Linux to start a new thread and immediately open another draft. The
next draft keeps the workspace mode and base branch you selected. With **New
worktree**, each background submission creates its own worktree.

## Pin and reorder threads

Pin a thread from its menu to keep it above your active work.

On web and desktop, you can also drag files from your computer onto any thread row:
the thread opens and the files are attached in its composer, ready for
your next message. The same per-message file limits apply as when attaching
files directly; see [Attach files](./composer.md#attach-files).

Pinning does not prevent automatic settlement. Settling a thread removes its pin.

<!-- fork:begin sidebar-v2-project-grouping — see .fork/customizations.yaml#sidebar-v2-project-grouping -->

On web and desktop, drag a pinned card to change its place among the pins; the other pins slide
aside to show where it will land, and the order survives a refresh. Threads do not move between
sections by dragging — use the row's own actions (**Pin**, **Settle**, **Snooze**) or its menu
for that. With the **Projects** row set to **Manual**, drag a project header above or below
another to arrange the projects themselves.

<!-- fork:end sidebar-v2-project-grouping -->

On web and desktop, the list also animates section changes made with thread actions such as
**Pin**, **Settle**, and **Snooze**. These transitions respect your system's reduced-motion
preference. While dragging, rows follow the insertion gap without replaying a second transition
after the drop.

If dragging is unavailable for one environment, update the T3 Code server running in that
environment. Pinned reordering requires server support. Threads from older servers keep their
default order until the server is updated.

<!-- fork:begin fork-new-agent-draft — see .fork/customizations.yaml#fork-new-agent-draft -->

## Starting an agent

**New agent** at the top of the sidebar (`mod+n`) opens an empty chat. Start writing straight
away; nothing appears in the thread list yet. To send, choose a project from the first pill above
the composer (ahead of the workspace and branch pills); the draft then takes its place under that
project. Change the project from the same pill before sending and the draft moves with it.
Clicking **New agent** again returns to the draft you left open.

The **Projects** row sorts and filters the list: the sort button picks the project order, and
the filter button turns grouping on and off and checks off which projects the list shows — tick
as many as you like; **All projects** clears the filter. Choose **Manual**
with grouping on to arrange projects yourself: drag a project header above or below another. Hover a project's
section to reveal its header buttons: the three dots open a menu with **Settle all threads** (every
active thread in that project) and **Settings**, and the plus starts a thread in it directly. **Usage** below **Add a project** opens the usage page.

<!-- fork:end fork-new-agent-draft -->

## Settle finished work

Choose **Settle thread** from its menu to move finished work out of the active list
without deleting the conversation. **Un-settle thread** restores it to active work
and prevents automatic settlement until new activity resumes the usual rules.
Manually settling an idle thread dismisses unanswered async questions without
sending an answer or restarting the agent.

<!-- fork:begin fork-composer-banner-surface — see .fork/customizations.yaml#fork-composer-banner-surface -->

On web and desktop, a settled thread shows only the **Un-settle** notice above the composer.
Other notices, including **Resume with less context**, appear after you un-settle the thread
if they still apply.

<!-- fork:end fork-composer-banner-surface -->

By default, environments settle inactive threads after three days and settle
threads whose pull request merged. A closed pull request can also settle an idle
thread. Work in progress, pending questions or approvals, and live background work
prevent automatic settlement. An open pull request does not prevent inactivity
settlement, but an old closed or merged pull request does not settle work you
resumed after it closed.

Change these rules in **Settings → General**. They continue to run when your apps
are closed. Changes apply to connected environments that support shared settings;
offline environments and older servers keep their previous values. If connected
environments disagree, **Apply to all** copies your current settings to those named
in the warning. Changing a rule does not reopen already settled threads.

## Link a pull request

The server finds the PR for each unsettled thread's saved branch, even when your
apps are closed. Settled threads keep their saved links. Update the server if
automatic branch links do not appear.

On web and desktop, right-click a pull request link in a thread and choose
**Link to thread** to select a different PR. Use **Unlink from thread** on the
same link to return to the branch PR, if one exists.
The linked pull request participates in automatic settlement.

## Find and reference work

On web and desktop, open the command palette with `Cmd/Ctrl+K` to search threads
across connected environments. Message search starts after two characters and
includes your messages and final agent responses.

Use **Settings → Keybindings** to find or customize shortcuts for searching files
and copying a thread reference. A copied reference uses the thread's pull request
link when available, otherwise its thread ID. See [keybindings](./keybindings.md)
for custom configuration.

## Inspect agent work

On web and desktop, use **Agents** to follow work delegated to subagents.

Expand a tool call in the conversation to see its full command and output.
Summaries shorten shell wrappers and can still describe the latest call after it
finishes; the call's own result shows its status.
