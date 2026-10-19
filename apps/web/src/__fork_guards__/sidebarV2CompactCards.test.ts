// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-compact-cards`.
 *
 * Guards the seam inside upstream's `Sidebar.tsx`: the switch is wired, a
 * compact card drops the repo line for its marks, and its height hint matches
 * the drawn height so offscreen rows do not make the scrollbar lie.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  SIDEBAR_V2_CARD_ALIGNMENT_PX,
  sidebarV2CompactCardHeight,
} from "../custom/sidebarV2CardAlignment";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/Sidebar.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");
const marks = readSibling("../custom/SidebarV2ThreadCardCompactMarks.tsx");

describe("fork guard: sidebar-v2-compact-cards", () => {
  it("offers the checkbox in the Threads filter menu", () => {
    expect(chromeRows).toContain("Compact cards");
    expect(chromeRows).toContain("onCheckedChange={props.onCompactCardsChange}");
    // A plain checkbox, apart from the grouping radios, its box trailing.
    expect(chromeRows).toMatch(/<OptionCheckboxItem\s+checked=\{props\.compactCards\}/u);
    expect(chromeRows).not.toMatch(/variant="switch"[\s\S]{0,120}checked=\{props\.compactCards\}/u);
    expect(sidebar).toContain("compactCards={compactCards}");
    // Slim shelf rows are already one line; only cards go compact.
    expect(sidebar).toContain("compact={isCard && compactCards}");
  });

  it("swaps the repo line for marks on the title line", () => {
    expect(sidebar).toContain("<SidebarV2ThreadCardCompactMarks");
    expect(sidebar).toMatch(
      /props\.compact === true \? null : \(\s*\/\*[^]*?\*\/\s*<SidebarV2ThreadCardMeta/u,
    );
    // The checkout mark is the repo line's own, so its pulse and accessible
    // text cannot drift between the two cards.
    expect(marks).toContain("<SidebarV2CheckoutMark");
    expect(marks).toContain('branchName="sr-only"');
    expect(sidebar).toContain("<SidebarV2CompactCardLead project={props.project} />");
  });

  it("hints the drawn compact height", () => {
    const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
    expect(sidebarV2CompactCardHeight()).toBe(px.cardPadY * 2 + px.titleLine);
    expect(sidebar).toContain(`[contain-intrinsic-size:auto_${sidebarV2CompactCardHeight()}px]`);
  });

  it("names a worktree checkout in the hover card", () => {
    expect(sidebar).toContain('<span className="shrink-0 text-muted-foreground">Worktree</span>');
  });
});
