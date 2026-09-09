// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * `sidebarV2Rain.test.ts` guards the working mark's motion. This file guards
 * the row it sits in: two lines at a fixed height, no status-driven surface,
 * and a trailing status slot that is never empty.
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
  sidebarV2CardHeight,
  sidebarV2HeaderMarkEdge,
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
    // Settlement is server-side since upstream #8600: a settled thread never
    // reads as woke, and there is no client auto-settle predicate to forward.
    expect(sidebarV2).toContain('thread.settledOverride !== "settled";');
    expect(sidebarV2).toMatch(
      /status === "ready" \|\| status === "working" \|\| status === "monitoring"/u,
    );
    expect(sidebarV2).toContain('? { label: "Monitoring", mark: "monitoring" }');
    // Monitoring is a pulsing dot via the shared mark renderer, not a sky
    // text label — and both card and slim draw it in the same 14px-tall slot.
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

  it("leads the flat card's project with its favicon, folder mark as the fallback", () => {
    // 12px, like every other mark on the repo line (Figma 364:17299).
    // Flat mode names the project on every card, and the favicon is what the
    // slim rows and the project menu already use for it. The slot is built on
    // the row's side from the project record upstream hands down (#10714)
    // beside the terminal glyph and handed in the same way, as one identifier. Its no-asset
    // fallback is the meta's own folder mark, so a favicon-less project draws
    // the design's glyph hidden from assistive tech like every other mark on
    // the line — ProjectFavicon's default fallback is not hidden. The meta
    // draws that same mark for a null slot.
    expect(sidebarV2).toContain("projectIconSlot={projectIcon}");
    expect(sidebarV2).toMatch(
      /const projectIcon =[^;]*?<ProjectFavicon\s+project=\{props\.project\}\s+className="[^"]*"\s+fallbackIcon=\{SidebarV2ProjectFolderMark\}/u,
    );
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain("props.projectIconSlot ?? <SidebarV2ProjectFolderMark");
  });

  it("rides the PR badge on the repo line, after the checkout cluster", () => {
    // Figma 364:14308 puts it on the repo line — glyph, then the number, in
    // the PR's state colour — and the card stays a fixed 54px because it is
    // one of the line's fixed-height members. The badge is a link to the PR,
    // so it must NOT sit inside the title line's hover-actions stack that
    // fades the elapsed time out — a control you can reach only by not
    // pointing at its row is not a control. Handed in as a required slot for
    // the same reason as the terminal glyph: a dropped call-site line fails
    // the typecheck instead of silently un-porting the badge.
    expect(sidebarV2).toContain("prSlot={prBadge}");
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain("readonly prSlot: ReactNode;");
    expect(meta).toContain("{props.prSlot ?? null}");
    // Glyph first, no hash, on the card only; the slim shelves keep upstream's
    // #N. Explicit 12px so the panel's --text-xs → 13px remap cannot grow it.
    expect(sidebarV2).toContain('<GitPullRequestIcon aria-hidden className="size-3 shrink-0" />');
    expect(sidebarV2).toContain(
      'variant === "card" ? "flex items-center gap-1 text-[0.75rem] leading-4" : "text-xs"',
    );
    expect(sidebarV2).not.toContain("{prBadge || hasHoverActions");
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
    const pinGlyph = /Pinned state rides the title line[\s\S]{0,400}?\{pinIndicator\}/u.exec(
      sidebarV2,
    )?.[0];
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
    // Every mark on the line is the component set's 12px (364:17299) — the
    // runtime glyph leads, then a hairline, then the checkout cluster.
    expect(meta).toContain('const MARK = "size-3 shrink-0"');
    expect(meta).toContain("<WorktreeIcon aria-hidden className={MARK} />");
    expect(meta).toContain("<GitBranchIcon aria-hidden className={MARK} />");
    // The folder mark is the exported SidebarV2ProjectFolderMark (also the
    // favicon's no-asset fallback); it carries the aria-hidden, the meta the size.
    expect(meta).toContain("<FolderIcon aria-hidden className={props.className} />");
    expect(meta).toContain("<SidebarV2ProjectFolderMark className={MARK} />");
    expect(meta).toContain("<CloudIcon aria-hidden className={MARK} />");
    expect(meta).toContain("<LaptopIcon aria-hidden className={MARK} />");
    expect(meta).toContain('className="h-2 w-px shrink-0 rounded-full bg-foreground/12"');
    expect(meta).not.toContain("size-6");
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
    // line's drawn box and one of the terms in the card's 54 — retune it
    // without the alignment module and the intrinsic-size hint lies.
    expect(threadCardTitleClassName({ recedes: false })).toContain("text-[0.875rem]");
    expect(threadCardTitleClassName({ recedes: false })).toContain("leading-[18px]");
    expect(SIDEBAR_V2_CARD_ALIGNMENT_PX.titleLine).toBe(18);
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain(
      'REPO_ROW =\n  "flex h-4 min-w-0 items-center justify-between gap-3 text-[0.75rem] leading-4 text-muted-foreground"',
    );
    expect(SIDEBAR_V2_CARD_ALIGNMENT_PX.metaLine).toBe(16);
  });

  it("gives a card 16px corners and a slim shelf row 8px", () => {
    // --radius is 10px, so neither is a rounded-* token: the card's is the
    // component set's literal (364:17299) and the slim rows keep --radius-md.
    const at = (variant: "card" | "slim") =>
      threadRowSurfaceClassName({ isActive: false, isSelected: false, recedes: false, variant });
    expect(at("card")).toContain("rounded-[16px]");
    expect(at("slim")).toContain("rounded-md");
    expect(at("slim")).not.toContain("rounded-[16px]");
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

  it("keeps a mark in the trailing status slot for every status, idle included", () => {
    // Idle used to fall back to a relative-time string on the trailing edge,
    // so the column alternated between a mark and a variable-width label.
    // The mark is never empty — the component set (364:17299) draws Idle as
    // the same 10px dot as Done on the muted channel, so the trailing column
    // holds a mark in every state. overflow-hidden is load-bearing — the
    // native rain grid is taller than the slot.
    expect(typeof SidebarV2IdleMark).toBe("function");
    // Card and slim both go through SidebarV2StatusMark; a regular idle card
    // takes the dot path so the trailing column is never empty.
    expect(sidebarV2).toContain('idle={showDiscardDraft ? "draft" : "dot"}');
    expect(sidebarV2).toContain("<SidebarV2StatusMark");
    // The box is the design's 10px dot wide by the rain's 14px tall, taken
    // from the shared alignment module; the marks inside keep their own sizes
    // and centre in it.
    expect(sidebarV2).toContain(
      "pointer-events-none flex shrink-0 items-center justify-center overflow-hidden",
    );
    expect(sidebarV2).toContain("SIDEBAR_V2_CARD_ALIGNMENT.statusBox");
    expect(SIDEBAR_V2_CARD_ALIGNMENT_PX.statusBoxWidth).toBe(12);
    expect(SIDEBAR_V2_CARD_ALIGNMENT_PX.statusBoxHeight).toBe(14);
    const marks = readSibling("../custom/SidebarV2StatusIndicator.tsx");
    expect(marks).toContain('className="block h-[14px] w-auto shrink-0 overflow-hidden"');
    expect(marks).toContain("const SLOT = 14");
    expect(marks).not.toContain("overflow-visible");
    // The settled forms, per the component set: dot for Done and Idle, the
    // half-filled circle for the two blocked-on-you states, the filled warning
    // circle for Failed — so form, not hue alone, separates waiting from done.
    expect(marks).toContain(
      'const MARK_SLOT_CLASS = "flex h-[14px] w-[12px] shrink-0 items-center justify-center"',
    );
    expect(marks).toMatch(
      /tone === "approval" \|\| tone === "input" \? \(\s*<CircleHalfIcon className="size-3" \/>/u,
    );
    expect(marks).toMatch(
      /tone === "failed" \? \(\s*<CircleAlertIcon weight="fill" className="size-3" \/>/u,
    );
    expect(marks).toContain('<span className="size-2.5 rounded-full bg-current" />');
    expect(marks).toContain('<span className="size-2.5 rounded-full bg-muted-foreground" />');
    expect(marks).not.toContain("size-2 rounded-full");
    // Hues, per Noey (2026-09-07): an unread finished turn is blue, and the
    // two waiting-on-you states share one amber — the half-circle already
    // says "waiting", and the tooltip says on what.
    expect(theme).toMatch(/--sidebar-v2-status-done:\s*#8b9cff;/u);
    expect(theme).toMatch(/--sidebar-v2-status-approval:\s*#ffcd59;/u);
    expect(theme).toMatch(/--sidebar-v2-status-input:\s*#ffcd59;/u);
    expect(theme).toMatch(/--sidebar-v2-status-working:\s*#24fe8a;/u);
  });

  it("starts the repo line on the prompt's edge, with no indent of its own", () => {
    // Nothing leads the prompt any more — the status mark trails — so both
    // rows share the card's padding and the meta carries no pl-* at all.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).not.toMatch(/\bpl-/u);
    expect(meta).not.toContain("repoIndent");
    // No overflow-hidden: the trailing h-6 settle/X cell overhangs this line
    // on purpose; clipping it was what squashed the hover fill into a bar.
    expect(sidebarV2).toContain("flex h-[18px] min-h-[18px] min-w-0 items-center");
    expect(sidebarV2).not.toMatch(
      /flex h-\[18px\] min-h-\[18px\] min-w-0 items-center[^"]*overflow-hidden/u,
    );
  });

  it("keeps the prompt and the group header's folder mark on one edge", () => {
    // The invariant the leading column exists for: a card's prompt and a
    // project header's folder mark start at the same x, reached through two
    // different paddings. Asserted as arithmetic rather than as class strings,
    // because the failure this catches is retuning one side and not the other
    // — which every substring assertion in this file would sail straight past.
    expect(sidebarV2HeaderMarkEdge()).toBe(sidebarV2PromptEdge());
    expect(sidebarV2PromptEdge()).toBe(20);

    // And the classes still spell the px they claim to. A constant that drifts
    // from its own derivation is the one way a named value is worse than a
    // literal at the call site.
    const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
    expect(SIDEBAR_V2_CARD_ALIGNMENT.cardPad).toBe(`px-${px.cardPad / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.cardPadY).toBe(`py-${px.cardPadY / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.rowGap).toBe(`gap-${px.rowGap / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.titleGap).toBe(`gap-${px.titleGap / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.trailingGap).toBe(`gap-${px.trailingGap / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.statusBox).toBe(
      `h-[${px.statusBoxHeight}px] w-[${px.statusBoxWidth}px]`,
    );
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerPad).toBe(`px-${px.headerPad / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerMarkBox).toBe(`size-${px.headerMarkBox / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerGap).toBe(`gap-${px.headerGap / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.listGap).toBe(`gap-${px.listGap / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerLead).toBe(`mt-[${px.headerLead}px]`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerLeadCollapsed).toBe(`mt-${px.headerLeadCollapsed / 4}`);
    expect(SIDEBAR_V2_CARD_ALIGNMENT.headerTrail).toBe(`mb-${px.headerTrail / 4}`);
    // The header row reads the same module, so the two sides cannot be
    // retuned apart without one of these going red.
    const header = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");
    expect(header).toContain("SIDEBAR_V2_CARD_ALIGNMENT.headerPad");
    expect(sidebarV2).toContain("SIDEBAR_V2_CARD_ALIGNMENT.cardPad");
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

  it("tones the whole repo line off the muted channel", () => {
    // The component set (364:17299) paints branch and model alike at
    // --muted-foreground; only the PR badge carries a colour of its own. The
    // line's tone rides REPO_ROW, pinned whole above, and nothing on it steps
    // up to foreground or down to a tinted muted.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).not.toContain("text-muted-foreground/70");
    expect(meta).not.toContain("text-foreground/70");
    expect(meta).toContain("text-[11px] leading-[15px]");
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
    // its own and so equals the drawn card: py-2 8 + title 18 + gap 4 + repo 16
    // + 8 = 54. The card reads its padding and gap from the alignment module,
    // whose sidebarV2CardHeight() is that sum, so a retune of any term moves
    // the hint with it — or the scrollbar lies by the difference on every row
    // it skips.
    expect(sidebarV2CardHeight()).toBe(54);
    expect(sidebarV2).toContain("SIDEBAR_V2_CARD_ALIGNMENT.rowGap");
    expect(sidebarV2).toContain("SIDEBAR_V2_CARD_ALIGNMENT.cardPadY");
    expect(sidebarV2).toContain(`[contain-intrinsic-size:auto_${sidebarV2CardHeight()}px]`);
    expect(sidebarV2).not.toMatch(/contain-intrinsic-size:auto_(?:52|77)px/u);
  });

  it("spaces cards 2px apart on the list, per the design", () => {
    // The ul's gap is the only vertical space between cards; the design stacks
    // 54px cards on a 56px pitch (364:11496). A project header buys the rest of
    // its own spacing — 24px above itself, nothing below — out of its margins,
    // so it does not depend on this gap staying wrong for it.
    expect(SIDEBAR_V2_CARD_ALIGNMENT_PX.listGap).toBe(2);
    expect(sidebarV2).toContain('cn("flex flex-col", SIDEBAR_V2_CARD_ALIGNMENT.listGap)');
    const header = readSibling("../custom/SidebarV2ProjectGroupHeader.tsx");
    expect(header).toContain("SIDEBAR_V2_CARD_ALIGNMENT.headerTrail");
    // The 24 is the open section's, spent under its last card; a header after
    // a closed or empty section takes the compact lead. The render decides
    // from the painted list, so a collapsed group still showing the route
    // thread counts as open.
    expect(header).toMatch(
      /props\.isFirst\s*\?\s*"mt-0"\s*:\s*props\.afterOpenSection\s*\?\s*SIDEBAR_V2_CARD_ALIGNMENT\.headerLead\s*:\s*SIDEBAR_V2_CARD_ALIGNMENT\.headerLeadCollapsed/u,
    );
    expect(sidebarV2).toContain(
      "previousSection !== undefined && previousSection.threads.length > 0;",
    );
    expect(sidebarV2).toContain("afterOpenSection={afterOpenSection}");
    // Every margin here is only correct relative to the list gap it sits on,
    // so all five are pinned as totals rather than as their own values.
    const px = SIDEBAR_V2_CARD_ALIGNMENT_PX;
    expect(px.listGap + px.headerTrail).toBe(2);
    expect(px.listGap + px.headerLead).toBe(24);
    expect(px.listGap + px.headerLeadCollapsed).toBe(8);
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
