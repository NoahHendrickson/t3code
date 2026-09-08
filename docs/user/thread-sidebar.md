# Organizing threads

Pin a thread from its context menu to keep it in the pinned section above your active work.
`mod+shift+p` pins or unpins the thread you have open. Pinned threads are shown independently of
their project, including when you connect to more than one environment.

To require confirmation before unpinning, enable **Settings → General → Unpin confirmation**. The
confirmation applies to the sidebar controls, thread menus, and the `mod+shift+p` shortcut.

Pinned threads still move to **Settled** when they become inactive. They also move when their pull
request merges if **Auto-settle merged threads** is enabled.

Each environment owns its automatic settlement settings. The server checks them even when no web,
desktop, or mobile client is connected. By default, it settles threads after three days without
activity and when their pull request merges. An eligible idle thread also settles when its pull
request closes. An open pull request blocks inactivity settlement. Active work, pending input, and
live background work keep the thread active. T3 Code settles from a closed or merged pull request
only when its timestamp is not older than the user's latest activity. If that timestamp is not
available, the inactivity rule still applies. A manual un-settle also keeps the thread active.
Change these rules in **Settings > General** for the environment. A settings change affects future
settlement and does not reopen a settled thread. Settings saved by older clients on one device no
longer control this behavior.

When you un-settle a thread, it returns to the top of the active list so you can find it right
away. Its timestamps do not change. Other threads keep their positions.

Right-click a pull request link in a thread and choose **Link to thread** to show that pull request
in the sidebar. The thread settles when the linked pull request merges if **Auto-settle merged
threads** is enabled. Right-click the same link and choose **Unlink from thread** to remove it.

On web and desktop, drag a pinned thread to change its position. On mobile, open the thread's menu
and choose **Move up** or **Move down**. The order is stored by the server and appears on your
other connected devices.

If reordering is unavailable for one environment, update the T3 Code server running in that
environment. Older servers can still pin and unpin threads, but do not understand synced ordering;
their pinned threads keep the default newest-first order below the ones you have arranged.

<!-- fork:begin fork-new-agent-draft — see .fork/customizations.yaml#fork-new-agent-draft -->

## Starting an agent

**New agent** at the top of the sidebar (`mod+n`) opens an empty chat with the composer ready.
Nothing appears in the thread list yet: choose a project from the pill above the composer, and
the draft takes its place under that project. Change the project from the same pill before
sending and the draft moves with it. Clicking **New agent** again returns to the draft you left
open.

The **Projects** row sorts and filters the list: the sort button picks the project order, and
the filter button turns grouping on and off and checks off which projects the list shows — tick
as many as you like; **All projects** clears the filter. Choose **Manual**
with grouping on to arrange projects yourself: drag a project header above or below another. Hover a project's
section to reveal its header buttons: the three dots open a menu with **Settle all threads** (every
active thread in that project) and **Settings**, and the plus starts a thread in it directly. **Usage** below **Add a project** opens the usage page.

<!-- fork:end fork-new-agent-draft -->

## Environment artwork

Dev and Nightly environments can identify themselves with artwork at the top of the sidebar and in
the send button. Choose **Artwork**, **Version pill**, or **None** in Settings under environment
identification. Artwork is recolored to match each built-in theme. Custom themes use the **Version
pill** fallback because their colors are not controlled by T3 Code.

To generate a fresh title from the conversation, open a thread's context menu and choose
**Regenerate title**. While T3 Code is generating it, the action reads **Regenerating…** and cannot
be selected again. The option is hidden when the connected environment needs a server update.
