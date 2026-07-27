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
import { threadCardTitleRecedes } from "../custom/sidebarV2RowPolicy";
import { SidebarV2ThreadCardMeta, threadCardShowsMetaRow } from "../custom/SidebarV2ThreadCardMeta";

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

  it("recedes exactly the two statuses with nothing to act on", () => {
    // The component set mutes Working and Idle at rest and nothing else, and
    // restores both on hover or selection. Asserted as behaviour rather than as
    // a class string so the rule is pinned even if the classes change.
    const at = (over: Partial<Parameters<typeof threadCardTitleRecedes>[0]>) =>
      threadCardTitleRecedes({
        isWorking: false,
        isIdle: false,
        isActive: false,
        isSelected: false,
        ...over,
      });
    expect(at({ isWorking: true })).toBe(true);
    expect(at({ isIdle: true })).toBe(true);
    // Approval / Input / Done / Failed all carry a mark and are not working.
    expect(at({})).toBe(false);
    // Pointing at a row always restores it — dimming there would read as
    // disabled rather than quiet.
    expect(at({ isWorking: true, isActive: true })).toBe(false);
    expect(at({ isIdle: true, isSelected: true })).toBe(false);
  });

  it("keeps row presentation policy out of the megacomponent", () => {
    // The policy is pure and fork-owned, so SidebarV2 carries call sites rather
    // than the rules. Inlining it back is the regression this catches.
    expect(sidebarV2).toContain("threadRowSurfaceClassName({");
    expect(sidebarV2).toContain("threadCardTitleRecedes({");
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

  it("collapses to two lines only when there is no PR and no diff", () => {
    // The third line exists to carry the PR badge and the diff counts. With
    // neither, drawing it leaves a blank 15px strip under every card.
    const show = threadCardShowsMetaRow;
    expect(show({ hasPr: false, insertions: null, deletions: null })).toBe(false);
    expect(show({ hasPr: true, insertions: null, deletions: null })).toBe(true);
    expect(show({ hasPr: false, insertions: 3, deletions: null })).toBe(true);
    expect(show({ hasPr: false, insertions: null, deletions: 3 })).toBe(true);
    // Zero is a real count — "+0 −0" is a turn that touched nothing, not a
    // thread with no diff at all.
    expect(show({ hasPr: false, insertions: 0, deletions: 0 })).toBe(true);
  });

  it("reserves each card's drawn height for offscreen rows", () => {
    // content-visibility skips offscreen rows; the intrinsic size is what keeps
    // the scrollbar honest while they are skipped. A stale value here makes the
    // list jump as you scroll, so both heights are pinned: three lines are 86px
    // (24 padding + 18 + 15 + 15 rows + 2x7 gaps), two are 64.
    expect(sidebarV2).toContain("[contain-intrinsic-size:auto_86px]");
    expect(sidebarV2).toContain("[contain-intrinsic-size:auto_64px]");
    // And the choice is made from the same predicate the component renders
    // from, so the hint cannot drift from the row count it describes.
    expect(sidebarV2).toContain("threadCardShowsMetaRow({");
  });

  it("binds diff counts to semantic tokens rather than palette literals", () => {
    // emerald-400/red-400 are correct in dark and illegible on the light panel.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain("text-success-foreground");
    expect(meta).toContain("text-destructive-foreground");
    expect(meta).not.toMatch(/text-(?:emerald|red)-\d/u);
  });
});
