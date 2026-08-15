// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * `sidebarV2Rain.test.ts` guards the working mark's motion. This file guards
 * the row it sits in: two lines at a fixed height, no status-driven surface,
 * and a leading status slot that is never empty.
 *
 * Assertions are outcome-shaped where they can be. The fork-owned meta
 * component is exercised as a module, and only its call site inside upstream's
 * `Sidebar.tsx` is checked textually — a rebase quietly dropping that call is
 * precisely the failure this file exists to catch, and it is not observable any
 * other way without standing up the whole sidebar.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { SidebarV2IdleMark } from "../custom/SidebarV2StatusIndicator";
import {
  SIDEBAR_V2_CARD_ALIGNMENT,
  SIDEBAR_V2_CARD_ALIGNMENT_PX,
  sidebarV2HeaderLabelEdge,
  sidebarV2PromptEdge,
} from "../custom/sidebarV2CardAlignment";
import {
  threadCardTitleClassName,
  threadCardTitleRecedes,
  threadRowSurfaceClassName,
} from "../custom/sidebarV2RowPolicy";
import { SidebarV2ThreadCardMeta } from "../custom/SidebarV2ThreadCardMeta";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebarV2 = readSibling("../components/Sidebar.tsx");
const theme = readSibling("../theme.custom.css");
const upstreamCss = readSibling("../index.css");

describe("fork guard: sidebar-v2-card-rows", () => {
  it("keeps upstream wake and monitoring semantics in the customized row", () => {
    expect(sidebarV2).toContain('prState !== "merged"');
    expect(sidebarV2).toContain('prState !== "closed"');
    expect(sidebarV2).toMatch(
      /status === "ready" \|\| status === "working" \|\| status === "monitoring"/u,
    );
    expect(sidebarV2).toContain('? { label: "Monitoring", mark: "monitoring" }');
    // Monitoring is a leading pulsing dot via the shared mark renderer, not a
    // sky text label — and both card and slim use the same fixed 14px slot.
    expect(sidebarV2).toContain("<SidebarV2StatusMark");
    expect(sidebarV2).not.toContain("text-sky-600 dark:text-sky-400");
    expect(sidebarV2).not.toContain("group-hover/sidebar-row:");
    expect(sidebarV2.match(/<SidebarV2StatusMark/gu)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("pulses the monitoring mark between white 50% and 20% opacity", () => {
    const indicator = readSibling("../custom/SidebarV2StatusIndicator.tsx");
    expect(indicator).toContain("export function SidebarV2MonitoringMark");
    expect(indicator).toContain("export function SidebarV2StatusMark");
    expect(indicator).toContain("data-fork-monitoring-pulse");
    expect(theme).toContain("@keyframes sidebar-v2-monitoring-pulse");
    expect(theme).toMatch(
      /\.dark \[data-fork-monitoring-pulse\]\s*\{[^}]*opacity:\s*0\.5[^}]*contain:\s*paint[^}]*animation:\s*sidebar-v2-monitoring-pulse/u,
    );
    // Duty-cycled + stepped (ghost-pulse / status-pulse): holds at each pole
    // with a short steps() ramp, not ease-in-out every vsync.
    expect(theme).toMatch(
      /@keyframes sidebar-v2-monitoring-pulse\s*\{[\s\S]*?opacity:\s*0\.5[\s\S]*?steps\(4\)[\s\S]*?opacity:\s*0\.2[\s\S]*?steps\(4\)/u,
    );
    expect(theme).not.toMatch(
      /sidebar-v2-monitoring-pulse[^;]*ease-in-out|sidebar-v2-monitoring-pulse[^;]*alternate/u,
    );
    expect(theme).not.toMatch(/\[data-fork-monitoring-pulse\]\s*\{[^}]*will-change/u);
  });

  it("keeps the card's repo line in the fork-owned component", () => {
    expect(typeof SidebarV2ThreadCardMeta).toBe("function");
    expect(sidebarV2).toContain("<SidebarV2ThreadCardMeta");
  });

  it("passes the repo line both halves the design gives fixed corners", () => {
    // Project + branch on the left, model + runtime on the right. Losing any of
    // these props silently empties half the line, which reads as "this thread
    // has no branch" rather than as a bug.
    for (const prop of ["projectTitle=", "branch=", "modelLabel=", "isRemote="]) {
      expect(sidebarV2).toContain(prop);
    }
  });

  it("rides the PR badge on the title line, not on a row of its own", () => {
    // Figma 113:728 moved it into the title row's trailing group, ahead of the
    // elapsed time. That move is what let the card become a fixed 52px: with
    // the diff counts gone from the design, the third row had nothing left to
    // carry. The badge is a link to the PR, so it must NOT sit inside the
    // hover-actions stack that fades the elapsed time out — a control you can
    // reach only by not pointing at its row is not a control.
    expect(sidebarV2).toContain('{prBadge || hasHoverActions || status === "working" ? (');
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).not.toContain("prSlot");
    // pe-1 is the design's 4px, spent both between the badge and the elapsed
    // time and, when it is alone, to the card's content edge. Explicit 12px so
    // the panel's --text-xs → 13px remap cannot grow it past that time.
    expect(sidebarV2).toContain('variant === "card" ? "pe-1 text-[0.75rem] leading-4" : "text-xs"');
  });

  it("keeps upstream's terminal-status glyph on the card's repo line", () => {
    // Ported from upstream #4712: the slim row renders `terminalStatusIcon`
    // directly, the card hands it to the fork-owned meta component as a slot.
    // The slot is required, so the typecheck catches a dropped prop — this
    // pins what the type cannot: that the call site passes the real glyph
    // rather than a placating `null`, and that the component actually renders
    // its slot instead of accepting and discarding it.
    expect(sidebarV2).toContain("terminalSlot={terminalStatusIcon}");
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain("props.terminalSlot");
  });

  it("marks a pinned card on its title line", () => {
    // The pinned block above the divider carries the grouping; the glyph
    // names the state per card. A sync dropping just this hunk leaves pinned
    // cards marked only by position, and nothing else fails.
    const pinGlyph = /\{props\.isPinned \? \([\s\S]{0,400}?<PinIcon/u.exec(sidebarV2)?.[0];
    expect(pinGlyph).toBeDefined();
  });

  it("marks a thread that runs in a worktree of its own", () => {
    // The mark replaces the branch mark rather than joining it, so losing the
    // prop does not empty a slot — it silently draws every worktree thread as
    // if it were on the project's checkout, which is the one thing this line
    // exists to disambiguate. The predicate has to stay the one the row's own
    // git cwd and env mode come from, or the mark and the row disagree.
    expect(sidebarV2).toContain("hasWorktree={thread.worktreePath !== null}");
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    // The slot's own gate, not just the ternary inside it. An earlier revision
    // nested the whole slot under `props.branch ?`, and this guard passed
    // throughout — the prop and the ternary were both present, and a substring
    // never says where the ternary sits. A worktree with no branch drew
    // nothing. Pinning the outer condition is what makes that regression fail.
    expect(meta).toContain("props.hasWorktree || props.branch ?");
    expect(meta).toContain("props.hasWorktree ?");
    expect(meta).toContain("<WorktreeIcon");
    // Branch, worktree, and project marks are 16px per the component set — they
    // name the two clusters on this line and share the prompt's axis above.
    // The runtime glyph stays 14px in a 24px box so its centre matches
    // settle/discard on the trailing axis.
    expect(meta).toContain('<WorktreeIcon aria-hidden className="size-4 shrink-0" />');
    expect(meta).toContain('<GitBranchIcon aria-hidden className="size-4 shrink-0" />');
    expect(meta).toContain('<FolderIcon aria-hidden className="size-4 shrink-0" />');
    expect(meta).toContain("inline-flex size-6 shrink-0 items-center justify-center");
    expect(meta).toContain('<CloudIcon aria-hidden className="size-3.5" />');
    expect(meta).toContain('<LaptopIcon aria-hidden className="size-3.5" />');
    expect(meta).not.toContain("pr-[3px]");
    // Decorative marks carry nothing to a screen reader, so the distinction
    // rides on text; a `sr-only` here is the whole of it.
    expect(meta).toMatch(/sr-only">Worktree</u);

    const icon = readSibling("../custom/icons/WorktreeIcon.tsx");
    // currentColor throughout: the Figma export paints white on a #1E1E1E
    // artboard, and either literal shipped as-is is invisible or a dark square
    // in the other theme.
    // Attribute form, not bare substrings: the file's own comment names both
    // literals to explain why neither is painted.
    expect(icon).not.toMatch(/(?:fill|stroke)="(?:#1E1E1E|white)"/iu);
    expect(icon).toContain("currentColor");
    // 32 viewBox at stroke 2 is Phosphor's 256-at-16 ratio. Retune one without
    // the other and this glyph stops matching the weight of the set it sits in.
    expect(icon).toContain('viewBox="0 0 32 32"');
    expect(icon).toContain('strokeWidth="2"');
  });

  it("recedes exactly the two statuses with nothing left to act on", () => {
    // The component set (Figma 113:724) mutes Done and Idle at rest and
    // nothing else, and restores both on hover or selection. Asserted as
    // behaviour rather than as a class string so the rule is pinned even if
    // the classes change.
    const at = (over: Partial<Parameters<typeof threadCardTitleRecedes>[0]>) =>
      threadCardTitleRecedes({
        isDone: false,
        isIdle: false,
        isActive: false,
        isSelected: false,
        ...over,
      });
    expect(at({ isDone: true })).toBe(true);
    expect(at({ isIdle: true })).toBe(true);
    // Working / Approval / Input / Failed keep the foreground title — each is
    // in motion or blocked on you.
    expect(at({})).toBe(false);
    // Pointing at a row always restores it — dimming there would read as
    // disabled rather than quiet.
    expect(at({ isDone: true, isActive: true })).toBe(false);
    expect(at({ isIdle: true, isSelected: true })).toBe(false);
  });

  it("draws every card title at the design's regular weight", () => {
    // Regular; the component set draws no medium titles. Colour alone
    // separates a receded title from a forward one.
    expect(threadCardTitleClassName({ recedes: true })).toContain("font-normal");
    expect(threadCardTitleClassName({ recedes: true })).not.toContain("font-medium");
    expect(threadCardTitleClassName({ recedes: false })).toContain("font-normal");
    expect(threadCardTitleClassName({ recedes: false })).not.toContain("font-medium");
  });

  it("sizes the card title at 0.875rem / 18px line and the repo line at 0.75rem", () => {
    // Explicit rem so the panel's --text-xs/--text-sm → 13px remap cannot
    // flatten title and branch to the chrome body size. 18px is the title
    // line's drawn box (Figma 113:726) and one of the four terms in the card's
    // 52 — retune it without the container and the intrinsic-size hint lies.
    expect(threadCardTitleClassName({ recedes: false })).toContain("text-[0.875rem]");
    expect(threadCardTitleClassName({ recedes: false })).toContain("leading-[18px]");
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain(
      'REPO_ROW =\n  "flex h-4 min-w-0 items-center gap-4 text-[0.75rem] leading-4 text-muted-foreground"',
    );
  });

  it("gives a card 12px corners and a slim shelf row 8px", () => {
    // --radius is 10px, so neither is a rounded-* token: the card's is the
    // component set's literal (113:725) and the slim rows keep --radius-md.
    const at = (variant: "card" | "slim") =>
      threadRowSurfaceClassName({ isActive: false, isSelected: false, recedes: false, variant });
    expect(at("card")).toContain("rounded-[12px]");
    expect(at("slim")).toContain("rounded-md");
    expect(at("slim")).not.toContain("rounded-[12px]");
  });

  it("lifts receded titles via a dedicated token, not the shared muted channel", () => {
    // Done/Idle titles read --fork-sidebar-card-title-receded so meta /70 and
    // shelf unread encoding keep calibrating against upstream
    // --muted-foreground. Falling back to text-muted-foreground alone would
    // quietly undo the title lift; lifting --muted-foreground itself would
    // re-derive every tinted muted consumer.
    const receded = threadCardTitleClassName({ recedes: true });
    expect(receded).toContain("--fork-sidebar-card-title-receded");
    expect(receded).not.toMatch(/(?:^|\s)text-muted-foreground(?:\/|\s|$)/u);
    expect(threadCardTitleClassName({ recedes: false })).toContain("text-foreground");
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

  it("keeps a mark in the leading status slot for every status, idle included", () => {
    // Idle used to fall back to a relative-time string on the trailing edge,
    // so the column alternated between a mark and a variable-width label.
    // The mark now leads the title line and is never empty — the hollow ring
    // holds the left column so the title text and the indented rows below
    // share one edge. 14px slot: at 16px the rain read as hanging below the
    // title. overflow-hidden is load-bearing — the native grid is taller.
    expect(typeof SidebarV2IdleMark).toBe("function");
    // Card and slim both go through SidebarV2StatusMark; idle="ring" is the
    // card's hollow-ring path so the leading column is never empty.
    expect(sidebarV2).toContain('idle="ring"');
    expect(sidebarV2).toContain("<SidebarV2StatusMark");
    // The box is the design's 16px (113:725 `indicator`), taken from the shared
    // alignment module; the marks inside keep their own sizes and centre in it
    // — the rain is 14px tall, a dot is 8px.
    expect(sidebarV2).toContain(
      "pointer-events-none flex shrink-0 items-center justify-center overflow-hidden",
    );
    expect(sidebarV2).toContain("SIDEBAR_V2_CARD_ALIGNMENT.statusBox");
    expect(SIDEBAR_V2_CARD_ALIGNMENT_PX.statusBox).toBe(16);
    const rain = readSibling("../custom/SidebarV2StatusIndicator.tsx");
    expect(rain).toContain('className="block h-[14px] w-auto shrink-0 overflow-hidden"');
    expect(rain).toContain("const SLOT = 14");
    expect(rain).not.toContain("overflow-visible");
  });

  it("indents the card's repo line under the title text", () => {
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain("CONTENT_INDENT = SIDEBAR_V2_CARD_ALIGNMENT.repoIndent");
    expect(meta).toContain("${CONTENT_INDENT}");
    // No overflow-hidden: the trailing h-6 settle/X cell overhangs this line
    // on purpose; clipping it was what squashed the hover fill into a bar.
    expect(sidebarV2).toContain("flex h-[18px] min-h-[18px] min-w-0 items-center");
    expect(sidebarV2).not.toMatch(
      /flex h-\[18px\] min-h-\[18px\] min-w-0 items-center[^"]*overflow-hidden/u,
    );
  });

  it("keeps the prompt and the group header label on one edge", () => {
    // The invariant the leading column exists for: a card's prompt and a
    // project header's label start at the same x, reached from two different
    // sides. Asserted as arithmetic rather than as three class strings, because
    // the failure this catches is retuning one side and not the other — which
    // every substring assertion in this file would sail straight past.
    expect(sidebarV2HeaderLabelEdge()).toBe(sidebarV2PromptEdge());
    expect(sidebarV2PromptEdge()).toBe(34);

    // And the classes still spell the px they claim to. A constant that drifts
    // from its own derivation is the one way a named value is worse than a
    // literal at the call site.
    const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
    expect(SIDEBAR_V2_CARD_ALIGNMENT.statusBox).toBe(`size-${px.statusBox / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.titleGap).toBe(`gap-${px.titleGap / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.repoIndent).toBe(`pl-${px.repoIndent / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerMarkBox).toBe(`size-${px.headerMarkBox / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerGap).toBe(`gap-${px.headerGap / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.listGap).toBe(`gap-${px.listGap / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerLead).toBe(`mt-[${px.headerLead}px]`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerTrail).toBe(`mb-${px.headerTrail / 4}`);

    // The repo line is deliberately 2px left of the prompt — the design's
    // number, not a rounding slip, so it is pinned as a difference.
    expect(px.cardPad + px.repoIndent).toBe(px.cardPad + px.statusBox + px.titleGap - 2);
  });

  it("does not layer text-xs onto card titles (that forced a 16px line box)", () => {
    // text-xs carries --text-xs--line-height: 1rem. Paired with the card's
    // explicit 0.875rem size it still won the cascade for leading and grew
    // the title row to 16px around a 14px rain. Slim shelves keep text-sm.
    const titleClass =
      /className=\{cn\(\s*"min-w-0 flex-1[^"]*",([\s\S]*?)isRegeneratingTitle/u.exec(
        sidebarV2,
      )?.[1];
    expect(titleClass).toBeDefined();
    expect(titleClass).toContain("threadCardTitleClassName({ recedes: cardRecedes })");
    expect(titleClass).not.toMatch(/variant === "card" \? "text-xs"/u);
    expect(titleClass).toContain('"text-sm"');
  });

  it("tones the repo line off the muted channel, branch a step above the model", () => {
    // The component set paints project and branch at --muted-foreground and the
    // model/runtime cluster at 70% of it. The branch stays the brighter of the
    // two — checkout identity is what tells two threads on one project apart —
    // but it carries that on the muted channel rather than on foreground/70,
    // which drifted a step brighter than the design as the panel was retuned.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    // The line's base tone rides REPO_ROW, pinned whole above; the model
    // cluster is the only thing that steps behind it.
    expect(meta).toContain('MUTED = "text-muted-foreground/70"');
    expect(meta).not.toContain("text-foreground/70");
  });

  it("draws every card at one height, whatever it carries", () => {
    // The card used to grow a third line for the PR badge and the diff counts,
    // and had to guess at that height before the per-row VCS query answered —
    // which is what made the list reflow under the pointer as the queries
    // landed. The component set fixes the card at 52px: the PR moved to the
    // title line and the diff counts left the design, so there is no longer a
    // row whose presence has to be predicted. Losing this is not a cosmetic
    // regression; it brings the reflow back.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).not.toContain("threadCardShowsMetaRow");
    expect(meta).not.toContain("prUnknown");
    expect(sidebarV2).not.toContain("prUnknown");
  });

  it("reserves each card's drawn height for offscreen rows", () => {
    // content-visibility skips offscreen rows; the intrinsic size is what keeps
    // the scrollbar honest while they are skipped. A stale value here makes the
    // list jump as you scroll. It measures the li, which carries no padding of
    // its own and so equals the drawn card: py-2 8 + title 18 + gap 2 + repo 16
    // + 8 = 52. Change the card's padding, gap, or either row's height and this
    // moves with them, or the scrollbar lies by the difference on every row it
    // skips.
    expect(sidebarV2).toContain("gap-0.5 px-1 py-2");
    expect(sidebarV2).toContain("[contain-intrinsic-size:auto_52px]");
    expect(sidebarV2).not.toMatch(/contain-intrinsic-size:auto_(?:54|77)px/u);
  });

  it("spaces cards 2px apart on the list, per the design", () => {
    // The ul's gap is the only vertical space between cards; the design stacks
    // 52px cards on a 54px pitch (293:20603). A project header buys the rest of
    // its own spacing — 4px to its first card, 20px above itself — out of its
    // margins, so it does not depend on this gap staying wrong for it.
    expect(SIDEBAR_V2_CARD_ALIGNMENT_PX.listGap).toBe(2);
    expect(sidebarV2).toContain('cn("flex flex-col", SIDEBAR_V2_CARD_ALIGNMENT.listGap)');
    const header = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");
    expect(header).toContain("SIDEBAR_V2_CARD_ALIGNMENT.headerTrail");
    expect(header).toContain('props.isFirst ? "mt-0" : SIDEBAR_V2_CARD_ALIGNMENT.headerLead');
    // Every margin here is only correct relative to the list gap it sits on,
    // so all five are pinned as totals rather than as their own values.
    const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
    expect(px.listGap + px.headerTrail).toBe(4);
    expect(px.listGap + px.headerLead).toBe(20);
    // The shelves and the pinned divider are NOT part of the card retune — the
    // design draws neither. Their totals are what they were before the gap
    // halved, and that is the point: a design change to the cards must not
    // reach them. Halving the gap without these three silently tightened all
    // of them by 2px.
    expect(px.listGap + px.pinnedDividerMargin).toBe(10);
    expect(px.listGap + px.shelfHeaderLead).toBe(16);
    expect(px.listGap + px.shelfHeaderTrail).toBe(8);
    expect(sidebarV2).toContain("SIDEBAR_V2_CARD_ALIGNMENT.pinnedDividerMargin");
    expect(sidebarV2).toContain("SIDEBAR_V2_CARD_ALIGNMENT.shelfHeaderLead");
    expect(sidebarV2).toContain("SIDEBAR_V2_CARD_ALIGNMENT.shelfHeaderTrail");
  });
});
