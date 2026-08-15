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

const sidebarV2 = readSibling("../components/Sidebar.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");
const trailingColumn = readSibling("../custom/sidebarV2TrailingColumn.ts");
const groupHeader = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");

/** Every row action, and how many times each is rendered: "Settle thread" twice
 * because the card and the slim row both offer it. A label that stops appearing
 * has lost its button; one that appears more often has grown a call site this
 * guard has never seen. */
const ROW_ACTIONS: ReadonlyArray<readonly [label: string, count: number]> = [
  // Pin and Unpin are one slot with two literal labels: the card renders one
  // branch per state so each label stays greppable here.
  ["Pin thread", 1],
  ["Unpin thread", 1],
  ["Snooze thread", 1],
  ["Settle thread", 2],
  ["Un-settle thread", 1],
  ["Wake thread now", 1],
];

/** The opening tag can't be sliced on its first `>` — the snooze trigger's
 * `onClick={(event) => …}` sits between the label and the class. A fixed window
 * comfortably covers the longest of the set. */
const TAG_WINDOW = 400;

function openingTags(label: string): string[] {
  return [...sidebarV2.matchAll(new RegExp(`aria-label="${label}"`, "gu"))].map((match) =>
    sidebarV2.slice(match.index, match.index + TAG_WINDOW),
  );
}

describe("fork guard: sidebar-v2-row-action-hit-area", () => {
  it("sizes the shared action box at 24px with a visible hover surface", () => {
    // Fork-owned, and in a module of its own rather than in sidebarV2RowPolicy,
    // whose subject is title-recede and row surface. The upstream file carries
    // call sites, not rules, and the project header's plus shares the exact box
    // rather than a copy of it.
    const declaration = /export const SIDEBAR_V2_ICON_BUTTON_CLASS =\s*"([^"]*)"/u.exec(
      trailingColumn,
    )?.[1];
    expect(declaration).toBeDefined();
    // size-6 is the target; the fill is what makes the target legible, and
    // without it the box is bigger but still guesswork.
    expect(declaration).toContain("size-6");
    expect(declaration).toContain("hover:bg-foreground/10");
    // 24px is the WCAG 2.5.8 floor exactly. The row actions are hover-gated so
    // never meet a coarse pointer, but the project header's plus is always
    // rendered — hence the 44px expansion ui/button and the chrome rows'
    // trailing buttons already carry, spent here once for the whole set.
    expect(declaration).toContain("pointer-coarse:after:min-h-11");
    expect(declaration).toContain("pointer-coarse:after:min-w-11");
    // The expansion is an ::after, so the box has to be a containing block.
    expect(declaration).toMatch(/(?:^|\s)relative(?:\s|$)/u);
    // Keyboard focus needs the edge the hover fill draws, for the same reason.
    expect(declaration).toContain("focus-visible:ring-2");
  });

  it("renders every row action from the shared class", () => {
    // Card-variant sites name the box directly; the three slim-row actions are
    // one control in three branches of a ternary and read a single shared
    // placement constant, which is what stopped them being three copies.
    const offenders = ROW_ACTIONS.flatMap(([label]) =>
      openingTags(label)
        .filter(
          (tag) =>
            !tag.includes("SIDEBAR_V2_ICON_BUTTON_CLASS") &&
            !tag.includes("SIDEBAR_V2_SLIM_ROW_ACTION_CLASS"),
        )
        .map(() => label),
    );
    expect(offenders).toEqual([]);
    // The header's plus is the fifth consumer and the one furthest from these
    // call sites; a copy of the box there is how the set starts drifting again.
    expect(groupHeader).toContain("SIDEBAR_V2_ICON_BUTTON_CLASS");
  });

  it("keeps every row action on screen", () => {
    const found = ROW_ACTIONS.map(([label]) => [label, openingTags(label).length] as const);
    expect(found).toEqual(ROW_ACTIONS.map(([label, count]) => [label, count]));
  });

  it("leads the card's hover cell with pin, ahead of snooze", () => {
    // The manifest claims placement, so the guard has to see sibling order:
    // both pin branches render before the SnoozePopoverButton in the same
    // actions cell. Source order is render order inside one flex row.
    const pin = sidebarV2.indexOf('aria-label="Pin thread"');
    const unpin = sidebarV2.indexOf('aria-label="Unpin thread"');
    const snooze = sidebarV2.indexOf("<SnoozePopoverButton");
    expect(pin).toBeGreaterThanOrEqual(0);
    expect(unpin).toBeGreaterThanOrEqual(0);
    expect(snooze).toBeGreaterThan(pin);
    expect(snooze).toBeGreaterThan(unpin);
  });

  it("lets no action re-grow padding of its own", () => {
    // The exact regression: a sync restores `px-2`/`px-1.5` at a call site, the
    // shared class stays in the file, and one button silently goes back to
    // being a different shape from the other four.
    //
    // The lookahead is load-bearing: `\b` sits between `2` and `.`, so a bare
    // `\bpx-2\b` also matches `px-2.5` — the slim rows' own documented padding,
    // and one this file names twice. With a 400-char window spanning into
    // sibling elements, that spelling drifting into any window would block CI
    // on a correct change.
    const padded = ROW_ACTIONS.flatMap(([label]) =>
      openingTags(label)
        .filter((tag) => /className=[\s\S]*?\bpx-(?:1\.5|2)(?![\w.])/u.test(tag))
        .map(() => label),
    );
    expect(padded).toEqual([]);
  });

  it("gives the card's trailing cell room for a 24px target", () => {
    // Title line is 14px; the cell holding the actions has to be 24 or the
    // button is clipped. It centres in the line and overhangs into py-2/gap-2.
    expect(sidebarV2).toContain("grid h-6 shrink-0 grid-cols-1 items-center justify-items-end");
  });

  it("nudges both row variants onto the trailing column's axis", () => {
    // Glyph alignment, not box alignment. The axis is 24px in from the panel's
    // content edge — the chrome rows' pe-3 plus half their 24px button. A card
    // reaches the same inset through list pad 8 + its own px-1, so its flush
    // controls owe nothing; the header and the slim rows' right-0 overlay sit
    // on the list's bare 8px edge and spend me-1; the shelf chevron's px-2.5
    // lands its 12px glyph on the axis by itself. Every offset is derived in
    // one module, so this asserts the values there and that each row reaches
    // for the one meant for it. A row reading another row's offset is the
    // drift this replaced inline strings to stop.
    const offsets = /SIDEBAR_V2_TRAILING_OFFSET = \{([\s\S]*?)\} as const;/u.exec(
      trailingColumn,
    )?.[1];
    expect(offsets).toBeDefined();
    expect(offsets).toMatch(/cardActions:\s*""/u);
    expect(offsets).toMatch(/slimActions:\s*"me-1"/u);
    expect(offsets).toMatch(/headerPlus:\s*"me-1"/u);
    expect(offsets).toMatch(/shelfChevron:\s*""/u);
    expect(offsets).toMatch(/chromeRow:\s*""/u);
    expect(sidebarV2).toContain("SIDEBAR_V2_TRAILING_OFFSET.cardActions");
    expect(trailingColumn).toContain("SIDEBAR_V2_TRAILING_OFFSET.slimActions");
    expect(groupHeader).toContain("SIDEBAR_V2_TRAILING_OFFSET.headerPlus");
    expect(chromeRows).toContain("SIDEBAR_V2_TRAILING_OFFSET.chromeRow");
    const shelfChevrons = [...sidebarV2.matchAll(/SIDEBAR_V2_TRAILING_OFFSET\.shelfChevron/gu)];
    expect(shelfChevrons.length).toBe(2);
    // Positioned, so the card's actions share a paint layer with the elapsed
    // span the crossfade turns into a stacking context — see the call site.
    // Matched on w-0, which is the actions wrapper's own collapse and not
    // something the elapsed span it shares the cell with ever carries.
    const cardActions = /"([^"]*col-start-1 row-start-1[^"]*\bw-0\b[^"]*)"/u.exec(sidebarV2)?.[1];
    expect(cardActions).toBeDefined();
    expect(cardActions).toContain("relative");
    // The chrome rows' share of the same axis: 4px, and only 4px — the list
    // pays for its own scroll gutter now (fork-sidebar-chrome guards that), so
    // a scrollbar term reappearing here would double-count it.
    //
    // Matched against the token rather than against one spelling of it. The
    // realistic sync outcome is a conflict resolved by keeping both terms —
    // `gap-1 pe-1 pe-[var(--app-scrollbar-width)]` — which is the exact
    // double-count this exists to catch and which a needle written as
    // `pe-[calc(var(--app-scrollbar-width)` sails through, that spelling having
    // never appeared in any revision of the file. Likewise `pe-1` as a
    // substring also accepts `pe-1.5` and `pe-10`, so it is bounded.
    expect(chromeRows).not.toMatch(/pe-\[[^\]]*--app-scrollbar-width/u);
    // 16px icons, matching the marks they line up with. Asserted positively:
    // a negative on `size-5` is anchored to class order and walks straight
    // through `className="shrink-0 size-5"`.
    // New thread / Add project render through ChromeLabeledAction's Icon slot;
    // the filter still mounts ListFilterIcon directly. Pin size-4 either way.
    expect(chromeRows).toContain("icon={PlusCircleIcon}");
    expect(chromeRows).toContain("icon={FolderPlusIcon}");
    const labeledIcon = /<Icon className="([^"]*)"/u.exec(chromeRows)?.[1];
    expect(labeledIcon, "ChromeLabeledAction icon class missing").toBeDefined();
    expect(labeledIcon).toMatch(/\bsize-4\b/u);
    expect(chromeRows).toMatch(/<ListFilterIcon[\s\S]{0,120}?\bsize-4\b/u);
    // The shelf headers' chevrons, 4px the other way: their row is px-2.5,
    // so a flush 12px glyph centres 6px in where a card's trailing box takes 8.
    const chevrons = [...sidebarV2.matchAll(/"size-3 ([^"]*transition-transform[^"]*)"/gu)];
    expect(chevrons.length).toBe(2);
  });

  it("keeps status out of the trailing actions cell", () => {
    // Status used to share the trailing grid cell with the hover actions; on
    // hover the status span went to opacity-0, became a stacking context, and
    // hit-tested above settle. Moving the mark to the leading column is the
    // structural fix — assert it stays there, and that the leading slot itself
    // is never a target.
    // Both variants' leading slots, since either regressing puts the mark back
    // in the trailing cell: the card's box is the design's 16px (113:725) and
    // the slim shelf row's stays 14px.
    expect(sidebarV2).toContain(
      "pointer-events-none flex size-4 shrink-0 items-center justify-center",
    );
    expect(sidebarV2).toContain(
      "pointer-events-none flex size-[14px] shrink-0 items-center justify-center",
    );
    // Idle and live marks alike render through the shared status-mark switch,
    // card rows drawing the idle ring and slim rows leaving the slot empty.
    expect(sidebarV2).toContain(
      '<SidebarV2StatusMark status={topStatus} rainSeed={threadKey} idle="ring" />',
    );
    expect(sidebarV2).toContain(
      '<SidebarV2StatusMark status={topStatus} rainSeed={threadKey} idle="empty" />',
    );
    // The trailing cell still fades elapsed on a working row when the hover
    // actions will replace it; that decoration must stay out of the hit path
    // for the same reason status used to. The fade class is gated separately
    // (no actions → nothing to yield to → no fade), so the base string is the
    // anchor here.
    const elapsedSpanClass =
      /"(pointer-events-none[^"]*col-start-1 row-start-1 flex items-center[^"]*)"/u.exec(
        sidebarV2,
      )?.[1];
    expect(elapsedSpanClass).toBeDefined();
    expect(sidebarV2).toContain("transition-opacity group-hover/v2-row:opacity-0");
  });
});
