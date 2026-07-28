// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-row-action-hit-area`.
 *
 * The row hover actions are icon-only, so their box is the entire pointer
 * target. Upstream sizes each one from padding around a 12px glyph at its own
 * call site — five call sites across two row variants — which is how they
 * drifted to 24x18 and 28x18, both under the 24px minimum and both invisible
 * until clicked.
 *
 * Assertions are textual because `SidebarV2Row` is not exported and the outcome
 * being guarded is a rendered box size, which needs the whole sidebar standing
 * up to observe. What is checked is the property that actually fails in a sync:
 * every action button reads the shared class rather than carrying padding of
 * its own, and the card's trailing cell is tall enough to hold one.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebarV2 = readSibling("../components/SidebarV2.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");
const rowPolicy = readSibling("../custom/sidebarV2RowPolicy.ts");
const groupHeader = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");

/** Every row action, and how many times each is rendered: "Settle thread" twice
 * because the card and the slim row both offer it. A label that stops appearing
 * has lost its button; one that appears more often has grown a call site this
 * guard has never seen. */
const ROW_ACTIONS: ReadonlyArray<readonly [label: string, count: number]> = [
  ["Snooze thread", 1],
  ["Settle thread", 2],
  ["Un-settle thread", 1],
  ["Wake thread now", 1],
];

/** The opening tag can't be sliced on its first `>` — the snooze trigger's
 * `onClick={(event) => …}` sits between the label and the class. A fixed window
 * comfortably covers the longest of the five. */
const TAG_WINDOW = 400;

function openingTags(label: string): string[] {
  return [...sidebarV2.matchAll(new RegExp(`aria-label="${label}"`, "gu"))].map((match) =>
    sidebarV2.slice(match.index, match.index + TAG_WINDOW),
  );
}

describe("fork guard: sidebar-v2-row-action-hit-area", () => {
  it("sizes the shared action box at 24px with a visible hover surface", () => {
    // Fork-owned, in custom/, so the upstream file carries the call sites and
    // not the rule — and so the project header's plus can share the exact box
    // rather than a copy of it.
    const declaration = /export const SIDEBAR_V2_ICON_BUTTON_CLASS =\s*([\s\S]{0,400}?);/u.exec(
      rowPolicy,
    )?.[1];
    expect(declaration).toBeDefined();
    // size-6 is the target; the fill is what makes the target legible, and
    // without it the box is bigger but still guesswork.
    expect(declaration).toContain("size-6");
    expect(declaration).toContain("hover:bg-foreground/10");
  });

  it("renders every row action from the shared class", () => {
    const offenders = ROW_ACTIONS.flatMap(([label]) =>
      openingTags(label)
        .filter((tag) => !tag.includes("SIDEBAR_V2_ICON_BUTTON_CLASS"))
        .map(() => label),
    );
    expect(offenders).toEqual([]);
    // The header's plus is the fifth consumer and the one furthest from these
    // call sites; a copy of the box there is how the set starts drifting again.
    expect(groupHeader).toContain("SIDEBAR_V2_ICON_BUTTON_CLASS");
  });

  it("keeps all five actions on screen", () => {
    const found = ROW_ACTIONS.map(([label]) => [label, openingTags(label).length] as const);
    expect(found).toEqual(ROW_ACTIONS.map(([label, count]) => [label, count]));
  });

  it("lets no action re-grow padding of its own", () => {
    // The exact regression: a sync restores `px-2`/`px-1.5` at a call site, the
    // shared class stays in the file, and one button silently goes back to
    // being a different shape from the other four.
    const padded = ROW_ACTIONS.flatMap(([label]) =>
      openingTags(label)
        .filter((tag) => /className=[\s\S]*?\bpx-(?:1\.5|2)\b/u.test(tag))
        .map(() => label),
    );
    expect(padded).toEqual([]);
  });

  it("gives the card's trailing cell room for a 24px target", () => {
    // h-[18px] is the title line and the working rain's own height; the cell
    // holding the actions has to be 24 or the button is clipped back to 18.
    expect(sidebarV2).toContain("grid h-6 shrink-0 grid-cols-1 items-center justify-items-end");
  });

  it("nudges both row variants onto the trailing column's axis", () => {
    // Glyph alignment, not box alignment: flush right edges put a card's
    // status dot, an action icon and a chrome icon on three axes 4px apart.
    // The card's actions give up 4px of their cell, slim rows 2px (they are
    // padded px-2.5 against px-3), and the chrome rows' inset covers the rest
    // — see the CONTROL_ROW note in custom/SidebarV2ChromeRows.tsx. Drop any
    // one of these and that row's icon steps out of the column on its own.
    const cardActions = /"col-start-1 row-start-1 ([^"]*)"/u.exec(sidebarV2)?.[1];
    expect(cardActions).toContain("-me-1");
    const slimNudges = [...sidebarV2.matchAll(/"absolute inset-y-0 right-0 ([^"]*)"/gu)];
    expect(slimNudges.length).toBe(3);
    for (const nudge of slimNudges) expect(nudge[1]).toContain("-me-0.5");
    // The chrome rows' share of the same axis: 4px, and only 4px — the list
    // pays for its own scroll gutter now (fork-sidebar-chrome guards that), so
    // a scrollbar term reappearing here would double-count it.
    expect(chromeRows).toContain("pe-1");
    expect(chromeRows).not.toContain("pe-[calc(var(--app-scrollbar-width)");
    // 16px icons, matching the marks they line up with. At size-5 they were
    // the only 20px glyphs in the column.
    expect(chromeRows).not.toMatch(/<(?:PlusCircle|FolderOpen)Icon className="size-5/u);
    // The shelf headers' chevrons, 4px the other way: their row is px-2.5,
    // so a flush 12px glyph centres 6px in where a card's mark takes 8.
    const chevrons = [...sidebarV2.matchAll(/"me-1 size-3 ([^"]*)"/gu)];
    expect(chevrons.length).toBe(2);
    for (const chevron of chevrons) expect(chevron[1]).toContain("transition-transform");
  });

  it("keeps the status mark out of the hit path it shares a cell with", () => {
    // The bug a bigger button did not fix. Status and actions occupy the same
    // grid cell; on hover the status span goes to opacity-0, which makes it a
    // stacking context and so paints ABOVE the in-flow actions. Invisible, it
    // still hit-tested first across its own width — the right half of the
    // settle button and none of snooze, which is why settle only responded
    // left of the checkmark. Any future opacity/z change to that span
    // reintroduces it unless the span stays out of the hit path entirely.
    const statusSpanClass = /"([^"]*col-start-1 row-start-1 flex items-center gap-2[^"]*)"/u.exec(
      sidebarV2,
    )?.[1];
    expect(statusSpanClass).toBeDefined();
    expect(statusSpanClass).toContain("pointer-events-none");
  });
});
