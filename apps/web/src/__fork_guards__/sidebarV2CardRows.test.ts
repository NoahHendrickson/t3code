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
import { threadCardTitleClassName, threadCardTitleRecedes } from "../custom/sidebarV2RowPolicy";
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

  it("sets idle card titles to regular weight, everything else medium", () => {
    // Idle is the hollow-ring row: quiet subject line, not a headline. Working
    // stays medium even when its colour recedes — the rain already says it is
    // busy; the weight should not also soften.
    expect(threadCardTitleClassName({ recedes: true, isIdle: true })).toContain("font-normal");
    expect(threadCardTitleClassName({ recedes: true, isIdle: true })).not.toContain("font-medium");
    expect(threadCardTitleClassName({ recedes: true, isIdle: false })).toContain("font-medium");
    expect(threadCardTitleClassName({ recedes: false, isIdle: false })).toContain("font-medium");
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
    // so the column alternated between a 16px mark and a variable-width label.
    // The mark now leads the title line and is never empty — the hollow ring
    // holds the left column so the title text and the indented rows below
    // share one edge.
    expect(typeof SidebarV2IdleMark).toBe("function");
    expect(sidebarV2).toContain("<SidebarV2IdleMark />");
    expect(sidebarV2).toContain(
      "pointer-events-none flex size-4 shrink-0 items-center justify-center",
    );
  });

  it("indents the card's lower rows under the title text", () => {
    // 24px = the leading 16px status + the title row's 8px gap. Dropping the
    // indent puts the branch under the rain instead of under the prompt.
    const meta = readSibling("../custom/SidebarV2ThreadCardMeta.tsx");
    expect(meta).toContain('CONTENT_INDENT = "pl-5"');
    expect(meta).toContain("${CONTENT_INDENT}");
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
    // which is the drawn card plus its own py-0.5: at the card's py-2.5, three
    // lines are 82 + 4 and two are 60 + 4. Change the card's vertical padding
    // and these move with it or the scrollbar starts lying by the difference
    // on every row it skips.
    expect(sidebarV2).toContain("gap-1 px-1 py-2");
    expect(sidebarV2).toContain("[contain-intrinsic-size:auto_77px]");
    expect(sidebarV2).toContain("[contain-intrinsic-size:auto_58px]");
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
