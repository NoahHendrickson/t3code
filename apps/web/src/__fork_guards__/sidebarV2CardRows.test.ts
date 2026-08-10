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
 * `Sidebar.tsx` is checked textually — a rebase quietly dropping that call is
 * precisely the failure this file exists to catch, and it is not observable any
 * other way without standing up the whole sidebar.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { SidebarV2IdleMark } from "../custom/SidebarV2StatusIndicator";
import { threadCardTitleClassName, threadCardTitleRecedes } from "../custom/sidebarV2RowPolicy";
import { SidebarV2ThreadCardMeta, threadCardShowsMetaRow } from "../custom/SidebarV2ThreadCardMeta";

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
    expect(sidebarV2).toContain("text-sky-600 dark:text-sky-400");
    expect(sidebarV2).not.toContain("group-hover/sidebar-row:");
  });

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
    // Branch, worktree, and runtime marks are 14px — retuning them to size-4
    // re-crowds the capped branch name and the model label. Runtime sits in a
    // 24px box so its centre matches settle/discard on the trailing axis.
    expect(meta).toContain('<WorktreeIcon aria-hidden className="size-3.5 shrink-0" />');
    expect(meta).toContain('<GitBranchIcon aria-hidden className="size-3.5 shrink-0" />');
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

  it("sizes the card title at 0.875rem / 14px line and the repo/branch line at 0.75rem", () => {
    // Explicit rem so the panel's --text-xs/--text-sm → 13px remap cannot
    // flatten title and branch to the chrome body size. Title leading matches
    // the 14px status slot — leading-4 left a 16px line around the rain.
    expect(threadCardTitleClassName({ recedes: false })).toContain("text-[0.875rem]");
    expect(threadCardTitleClassName({ recedes: false })).toContain("leading-[14px]");
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain('REPO_ROW = "flex h-4 min-w-0 items-center text-[0.75rem] leading-4"');
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
    expect(sidebarV2).toContain("<SidebarV2IdleMark />");
    expect(sidebarV2).toContain(
      "pointer-events-none flex size-[14px] shrink-0 items-center justify-center overflow-hidden",
    );
    const rain = readSibling("../custom/SidebarV2StatusIndicator.tsx");
    expect(rain).toContain('className="block h-[14px] w-auto shrink-0 overflow-hidden"');
    expect(rain).toContain("const SLOT = 14");
    expect(rain).not.toContain("overflow-visible");
  });

  it("indents the card's lower rows under the title text", () => {
    // 24px = the leading 14px status + the title row's 10px gap — matches the
    // group header label once list pad is shared. Dropping the indent puts
    // the branch under the rain instead of under the prompt.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain('CONTENT_INDENT = "pl-6"');
    expect(meta).toContain("${CONTENT_INDENT}");
    // No overflow-hidden: the trailing h-6 settle/X cell overhangs this line
    // on purpose; clipping it was what squashed the hover fill into a bar.
    expect(sidebarV2).toContain("flex h-[14px] min-h-[14px] min-w-0 items-center gap-2.5");
    expect(sidebarV2).not.toMatch(
      /flex h-\[14px\] min-h-\[14px\] min-w-0 items-center gap-2\.5 overflow-hidden/u,
    );
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

  it("lifts the branch cluster closer to the title than the surrounding meta", () => {
    // Project, model, and runtime stay at muted/70; the checkout mark+name
    // shares the title's foreground channel at 70% so it stays readable
    // without matching the prompt.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain('BRANCH = "text-foreground/70"');
    expect(meta).toContain("${BRANCH}");
    expect(meta).toContain('MUTED = "text-muted-foreground/70"');
  });

  it("collapses to two lines only when it knows there is no PR and no diff", () => {
    // The third line exists to carry the PR badge and the diff counts. With
    // neither, drawing it leaves a blank 15px strip under every card.
    const show = threadCardShowsMetaRow;
    const known = { hasPr: false, prUnknown: false, insertions: null, deletions: null };
    expect(show(known)).toBe(false);
    expect(show({ ...known, hasPr: true })).toBe(true);
    expect(show({ ...known, insertions: 3 })).toBe(true);
    expect(show({ ...known, deletions: 3 })).toBe(true);
    // Zero is a real count — "+0 −0" is a turn that touched nothing, not a
    // thread with no diff at all.
    expect(show({ ...known, insertions: 0, deletions: 0 })).toBe(true);
    // The one that is not about content: whether a thread has a PR is the
    // answer to a per-row VCS query, and collapsing before it lands makes every
    // PR card grow 15px mid-scroll as the queries resolve.
    expect(show({ ...known, prUnknown: true })).toBe(true);
    // Unknown means "has never answered", not "is polling": the query re-enters
    // waiting on every refresh, and reading that alone flips the height on a
    // loop rather than once.
    expect(sidebarV2).toContain(
      "const prUnknown = gitStatus.data === null && gitStatus.isPending;",
    );
  });

  it("reserves each card's drawn height for offscreen rows", () => {
    // content-visibility skips offscreen rows; the intrinsic size is what keeps
    // the scrollbar honest while they are skipped. A stale value here makes the
    // list jump as you scroll, so both heights are pinned. They measure the li,
    // which carries no padding of its own and so equals the drawn card: title
    // line 14px + repo 16px + gaps/pad → 54 two-line, 77 three-line. Change
    // the card's vertical padding or gap and these move with it or the
    // scrollbar starts lying by the difference on every row it skips.
    expect(sidebarV2).toContain("gap-2 px-1 py-2");
    expect(sidebarV2).toContain("[contain-intrinsic-size:auto_77px]");
    expect(sidebarV2).toContain("[contain-intrinsic-size:auto_54px]");
    // And the choice is made from the same predicate the component renders
    // from, so the hint cannot drift from the row count it describes.
    expect(sidebarV2).toContain("threadCardShowsMetaRow({");
  });

  it("spaces cards 4px apart on the list, not Figma's 2px", () => {
    // The ul's gap is the only vertical space between cards (and between a
    // group header and its first card). Figma drew 2px (gap-0.5); the fork
    // retunes to 4px (gap-1) for breathing room on the lifted panel. A sync
    // that restores gap-0.5 would quietly tighten the list again.
    expect(sidebarV2).toContain('className="flex flex-col gap-1"');
    expect(sidebarV2).not.toContain('className="flex flex-col gap-0.5"');
  });

  it("binds diff counts to semantic tokens rather than palette literals", () => {
    // emerald-400/red-400 are correct in dark and illegible on the light panel.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain("text-success-foreground");
    expect(meta).toContain("text-destructive-foreground");
    expect(meta).not.toMatch(/text-(?:emerald|red)-\d/u);
  });
});
