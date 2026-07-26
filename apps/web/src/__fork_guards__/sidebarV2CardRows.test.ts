// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * `sidebarV2Rain.test.ts` guards the working mark's motion. This file guards
 * the row it sits in: three lines, no status-driven surface, and a trailing
 * slot that is never empty.
 *
 * Assertions are outcome-shaped where they can be. The fork-owned meta
 * component is exercised as a module, and only its call site inside upstream's
 * `SidebarV2.tsx` is checked textually — a rebase quietly dropping that call is
 * precisely the failure this file exists to catch, and it is not observable any
 * other way without standing up the whole sidebar.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { SidebarV2IdleMark } from "../custom/SidebarV2StatusIndicator";
import { SidebarV2ThreadCardMeta } from "../custom/SidebarV2ThreadCardMeta";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebarV2 = readSibling("../components/SidebarV2.tsx");
const theme = readSibling("../theme.custom.css");
const upstreamCss = readSibling("../index.css");

describe("fork guard: sidebar-v2-card-rows", () => {
  it("keeps the card's lower two lines in the fork-owned component", () => {
    expect(typeof SidebarV2ThreadCardMeta).toBe("function");
    expect(sidebarV2).toContain("<SidebarV2ThreadCardMeta");
  });

  it("passes the meta line both halves the design gives fixed corners", () => {
    // PR + diff on the left, model + runtime on the right. Losing any of these
    // props silently empties half the line, which reads as "this thread has no
    // PR" rather than as a bug.
    for (const prop of ["prSlot=", "insertions=", "deletions=", "modelLabel=", "isRemote="]) {
      expect(sidebarV2).toContain(prop);
    }
  });

  it("never paints a row surface from its status", () => {
    // The reversal this revision is about. `--sidebar-row-working` was the
    // resting fill; both the token and every reference to it are gone, and a
    // reintroduced one would put the panel back to a field of lit rectangles in
    // which hover means nothing.
    expect(sidebarV2).not.toContain("bg-sidebar-row-working");
    expect(theme).not.toContain("--sidebar-row-working");
    expect(upstreamCss).not.toContain("--color-sidebar-row-working");
  });

  it("keeps a mark in the trailing slot for every status, idle included", () => {
    // Idle used to fall back to a relative-time string, so the trailing column
    // alternated between a 16px mark and a variable-width label and nothing
    // below it could align.
    expect(typeof SidebarV2IdleMark).toBe("function");
    expect(sidebarV2).toContain("<SidebarV2IdleMark />");
  });

  it("reserves the card's drawn height for offscreen rows", () => {
    // content-visibility skips offscreen rows; the intrinsic size is what keeps
    // the scrollbar honest while they are skipped. A stale value here makes the
    // list jump as you scroll — three lines are 86px, not the old two-line 76.
    expect(sidebarV2).toContain("[contain-intrinsic-size:auto_86px]");
  });

  it("binds diff counts to semantic tokens rather than palette literals", () => {
    // emerald-400/red-400 are correct in dark and illegible on the light panel.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain("text-success-foreground");
    expect(meta).toContain("text-destructive-foreground");
    expect(meta).not.toMatch(/text-(?:emerald|red)-\d/u);
  });
});
