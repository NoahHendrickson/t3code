// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-dev-server-pulse`.
 *
 * The thread card's branch/worktree mark pulses working-green to foreground
 * while the port scanner attributes a listening dev server to one of the
 * thread's own T3 terminals. Three pieces have to stay joined for that to
 * happen — the row's fenced subscription in upstream's `SidebarV2.tsx`, the
 * attribute gate in the fork-owned meta component, and the animation in the
 * Tier 1 stylesheet — and a sync can silently drop any one of them while the
 * other two keep compiling. Each assertion below pins one seam.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebarV2 = readSibling("../components/SidebarV2.tsx");
const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
const theme = readSibling("../theme.custom.css");

describe("fork guard: sidebar-v2-dev-server-pulse", () => {
  it("joins the row to the port scanner's terminal→thread attribution", () => {
    // The one data source this feature is allowed: a listener the scanner's
    // subprocess inspection traced to one of the thread's own terminals.
    // Losing the hook call leaves the prop permanently false, which renders as
    // "no dev server anywhere" rather than as a bug.
    expect(sidebarV2).toContain("useThreadDiscoveredPorts({");
    expect(sidebarV2).toContain("devServerLive={devServerLive}");
    // The filter lives in upstream's `portDiscoveryState.ts`
    // (`port.terminal?.threadId`), which is on this customization's watch
    // list. An externally launched server has `terminal: null` and must light
    // nothing — that behaviour is the hook's, so it is watched, not asserted.
  });

  it("gates the pulse attribute on the prop, absent rather than false", () => {
    // The stylesheet keys on attribute *presence*. `data-…={false}` would
    // still serialize an attribute and pulse every row, so the off state must
    // be `undefined`, which React omits entirely.
    expect(meta).toContain('data-fork-dev-server-live={props.devServerLive ? "" : undefined}');
  });

  it("carries the state in text, because the motion is decorative", () => {
    // Both marks are aria-hidden and the animation is invisible to a screen
    // reader; the `sr-only` label is the whole of the accessible signal.
    expect(meta).toMatch(/sr-only">Dev server running</u);
  });

  it("animates the mark from the working green, scoped to the fork marker", () => {
    // Same hue as the trailing mark's "working": one green for "alive" across
    // the card. `> svg` keeps the branch text out of the animation.
    expect(theme).toContain(
      ':root[data-fork="noahhendrickson-t3code"] [data-fork-dev-server-live] > svg',
    );
    expect(theme).toMatch(
      /\[data-fork-dev-server-live\] > svg \{\n {2}color: var\(--sidebar-v2-status-working\);\n {2}animation: sidebar-v2-dev-server-pulse/u,
    );
    // Foreground, not literal white: light mode pulses toward ink instead of
    // vanishing into the panel.
    expect(theme).toMatch(
      /@keyframes sidebar-v2-dev-server-pulse \{\n {2}from \{\n {4}color: var\(--sidebar-v2-status-working\);\n {2}\}\n {2}to \{\n {4}color: var\(--foreground\);/u,
    );
  });

  it("drops the motion, not the state, under prefers-reduced-motion", () => {
    // `animation: none` inside the media query leaves the static `color`
    // declaration standing, so reduced-motion users get a steady green mark
    // rather than losing the indicator.
    const reduced = theme.match(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\[data-fork-dev-server-live\] > svg \{\n {4}animation: none;/u,
    );
    expect(reduced).not.toBeNull();
  });
});
