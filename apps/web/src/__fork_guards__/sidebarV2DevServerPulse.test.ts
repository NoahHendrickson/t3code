// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-dev-server-pulse`.
 *
 * The thread card's branch/worktree mark pulses working-green to foreground
 * while the port scanner attributes a listening server to one of the thread's
 * own T3 terminals. Three pieces have to stay joined — the fenced subscription
 * in upstream's `Sidebar.tsx`, the gate in the fork-owned meta component,
 * and the animation in the Tier 1 stylesheet — and a sync can drop any one
 * while the other two keep compiling.
 *
 * Assertion style, learned the hard way (PR #32 review replayed the first
 * revision of this file against mutated sources and all eight assertions
 * passed while the feature was dead, inverted, or always-on):
 *
 * - Source assertions run against the extracted `fork:begin`/`fork:end`
 *   hunks, never the whole file, and pin the *expressions* — the subscription
 *   input gate and the derived port — not the existence of a call. The
 *   `readMainHunk` precedent is `forkClerkLaunchResilience.test.ts`.
 * - The meta component is asserted on its rendered output, so the attribute
 *   gate, the `> svg` DOM contract the stylesheet depends on, and the
 *   accessible text are pinned as outcomes a formatting pass cannot shake.
 * - CSS is read through `cssRules.ts`, so declaration order and whitespace
 *   are free to change while scoping and content are not.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SidebarV2ThreadCardMeta } from "../custom/SidebarV2ThreadCardMeta";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebarV2 = readSibling("../components/Sidebar.tsx");
const theme = readSibling("../theme.custom.css");

/** Every fenced hunk for this customization, concatenated, so assertions can
    only match shipped code — never prose, comments elsewhere, or the manifest
    quoting itself. */
function readPulseHunks(): string {
  const begin = "fork:begin sidebar-v2-dev-server-pulse";
  const end = "fork:end sidebar-v2-dev-server-pulse";
  const hunks: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = sidebarV2.indexOf(begin, cursor);
    if (start === -1) break;
    const stop = sidebarV2.indexOf(end, start);
    if (stop === -1) throw new Error("unterminated sidebar-v2-dev-server-pulse hunk");
    hunks.push(sidebarV2.slice(start, stop));
    cursor = stop + end.length;
  }
  if (hunks.length === 0) throw new Error("no sidebar-v2-dev-server-pulse hunks in Sidebar.tsx");
  return hunks.join("\n");
}

function renderMeta(over: {
  readonly branch?: string | null;
  readonly hasWorktree?: boolean;
  readonly devServerPort?: number | null;
}): string {
  return renderToStaticMarkup(
    createElement(SidebarV2ThreadCardMeta, {
      projectTitle: null,
      branch: over.branch ?? null,
      hasWorktree: over.hasWorktree ?? false,
      devServerPort: over.devServerPort ?? null,
      terminalSlot: null,
      prSlot: null,
      prUnknown: false,
      insertions: null,
      deletions: null,
      modelLabel: null,
      isRemote: false,
    }),
  );
}

describe("fork guard: sidebar-v2-dev-server-pulse", () => {
  it("subscribes card rows to the thread's own attribution, and slim rows to nothing", () => {
    const hunk = readPulseHunks();
    // The full input expressions, not the call's existence. `threadId: null`
    // (dead feature), a dropped variant gate (slim rows retaining the
    // scanner), or a hardcoded id all fail here, where "the call exists"
    // passed for every one of them.
    expect(hunk).toContain('environmentId: variant === "card" ? thread.environmentId : null,');
    expect(hunk).toContain('threadId: variant === "card" ? thread.id : null,');
    // The derived values, pinned as expressions: `= null` (never pulses) and
    // `= 5173` (always pulses) both fail.
    expect(hunk).toContain("const devServerPort = devServerPorts[0]?.port ?? null;");
    expect(hunk).toContain("devServerPort={devServerPort}");
    // The tooltip names what the mark can only signal — port plus overflow
    // count — and receives it through the same fenced seam. Both host
    // branches are pinned: a remote thread's listener is on the remote host,
    // so "localhost" there would name the wrong machine (round-2 review #1),
    // while a local thread keeps the copy-pasteable form.
    expect(hunk).toContain("isRemote ? `port ${devServerPort}` : `localhost:${devServerPort}`");
    expect(hunk).toContain("devServerLabel={devServerLabel}");
    expect(hunk).toContain("{devServerLabel ? (");
  });

  it("marks the slot only while a port is attributed, absent rather than false", () => {
    // Rendered output, not source text: the stylesheet keys on attribute
    // *presence*, and `data-…={false}` would still serialize an attribute and
    // pulse every row. React omits `undefined` entirely, so the off state
    // must render with no attribute at all.
    const live = renderMeta({ branch: "fork/x", hasWorktree: true, devServerPort: 5173 });
    expect(live).toContain('data-fork-dev-server-live=""');
    const off = renderMeta({ branch: "fork/x", hasWorktree: true, devServerPort: null });
    expect(off).not.toContain("data-fork-dev-server-live");
  });

  it("keeps the mark a direct child of the attributed slot, as `> svg` requires", () => {
    // The stylesheet's `[data-fork-dev-server-live] > svg` is a DOM-structure
    // contract; wrapping the icon (a tooltip trigger, a span) kills the pulse
    // with every source-text assertion green. Pinned on the rendered tree:
    // the svg follows the attribute with at most sr-only text between, for
    // both marks the slot can draw.
    const directChild =
      /data-fork-dev-server-live="">(?:<span class="sr-only">[^<]*<\/span>)*<svg/u;
    expect(renderMeta({ branch: "fork/x", hasWorktree: true, devServerPort: 5173 })).toMatch(
      directChild,
    );
    expect(renderMeta({ branch: "fork/x", hasWorktree: false, devServerPort: 5173 })).toMatch(
      directChild,
    );
  });

  it("says what the scanner knows — the port — after the identity it belongs to", () => {
    // "Server listening on port N", never "dev server": the scanner keeps
    // every listening TCP socket (debuggers, tunnels, databases), so naming
    // the port is the whole truthful claim. Ordered after the branch name so
    // a screen reader hears what the row is before its transient state.
    const live = renderMeta({ branch: "fork/x", hasWorktree: true, devServerPort: 5173 });
    expect(live).toContain("Server listening on port 5173");
    expect(live).not.toMatch(/dev server/iu);
    expect(live.indexOf("Server listening on port 5173")).toBeGreaterThan(live.indexOf("fork/x"));
    // A thread with neither branch nor worktree draws no slot: no attribute,
    // no orphaned announcement.
    const slotless = renderMeta({ branch: null, hasWorktree: false, devServerPort: 5173 });
    expect(slotless).not.toContain("data-fork-dev-server-live");
    expect(slotless).not.toContain("Server listening");
  });

  it("animates the mark from the working green, scoped to the fork marker", () => {
    const rules = cssRules(theme);
    const selector = ':root[data-fork="noahhendrickson-t3code"] [data-fork-dev-server-live] > svg';
    // Declaration content, order-free: the first revision pinned `color:` one
    // line above `animation:` and broke on a behaviour-identical swap.
    const base = rules.find((rule) => rule.selector === selector && rule.atRules.length === 0);
    expect(base).toBeDefined();
    expect(base?.body).toContain("animation: sidebar-v2-dev-server-pulse");
    // The static declaration is what reduced-motion falls back onto.
    expect(base?.body).toContain("color: var(--sidebar-v2-status-working)");

    const keyframeRules = rules.filter((rule) =>
      rule.atRules.some((at) => at === "@keyframes sidebar-v2-dev-server-pulse"),
    );
    const from = keyframeRules.find((rule) => rule.selector === "from");
    const to = keyframeRules.find((rule) => rule.selector === "to");
    // Working green to foreground — not literal white, so light mode pulses
    // toward ink instead of vanishing into the panel.
    expect(from?.body).toContain("color: var(--sidebar-v2-status-working)");
    expect(to?.body).toContain("color: var(--foreground)");
  });

  it("drops the motion, not the state, under prefers-reduced-motion", () => {
    const rules = cssRules(theme);
    const reduced = rules.find(
      (rule) =>
        rule.selector ===
          ':root[data-fork="noahhendrickson-t3code"] [data-fork-dev-server-live] > svg' &&
        rule.atRules.some((at) => at.includes("prefers-reduced-motion: reduce")),
    );
    // `animation: none` leaves the base rule's static green standing, so
    // reduced-motion users keep the indicator and lose only the breathing.
    expect(reduced).toBeDefined();
    expect(reduced?.body).toContain("animation: none");
  });
});
