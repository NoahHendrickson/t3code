// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-new-agent-draft`.
 *
 * The model (an unassigned draft under its own logical key) is tested as
 * behaviour next to the module (`custom/newAgentDraft.test.ts`). This file
 * guards the seams inside upstream files, which nothing else can observe
 * without standing up the whole app: the sidebar's button and its shortcut
 * both start the unassigned draft, the draft rows skip it, and the draft
 * hero's project chooser is the fork's pill.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/Sidebar.tsx");
const chatRoute = readSibling("../routes/_chat.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");
const draftRows = readSibling("../custom/sidebarV2DraftRows.ts");
const hooks = readSibling("../custom/useNewAgentDraft.ts");

describe("fork guard: fork-new-agent-draft", () => {
  it("starts an unassigned draft from the sidebar's New agent row", () => {
    // The row is labelled for what it does now, and its click no longer asks
    // which project first — neither the single-project shortcut nor the
    // palette picker survive on this button.
    expect(chromeRows).toContain('label="New agent"');
    expect(sidebar).toContain("const startNewAgentDraft = useStartNewAgentDraft();");
    expect(sidebar).toMatch(
      /const handleNewThreadClick = useCallback\(\(\) => \{\s*if \(isMobile\) setOpenMobile\(false\);\s*void startNewAgentDraft\(\);/u,
    );
    // The import and the call, not the name: a fence comment records why the
    // import left, and prose must not be able to trip this.
    expect(sidebar).not.toMatch(/^\s+shouldCreateNewThreadInCurrentProject,\s*$/mu);
    expect(sidebar).not.toContain("shouldCreateNewThreadInCurrentProject(");
    expect(sidebar).not.toContain('open: "new-thread-in"');
    // The grouped header's plus still creates straight into its project;
    // that door is the one that already knows the answer.
    expect(sidebar).toContain("newThreadContext.handleNewThread(");
    // The row holds its hover fill while the open draft has no project, and
    // lets go once the pill assigns one and the draft gets a card.
    expect(sidebar).toContain(
      "newThreadActive={isUnassignedDraft(newThreadContext.activeDraftThread)}",
    );
    expect(chromeRows).toContain("active={props.newThreadActive}");
    expect(chromeRows).toContain('props.active && "bg-sidebar-row-hover text-sidebar-foreground"');
  });

  it("routes the chat.new shortcut through the same door", () => {
    // A behaviour reachable from the button is reachable from the keybinding;
    // the legacy sidebar keeps upstream's contextual create.
    expect(chatRoute).toMatch(
      /if \(command === "chat\.new"\) \{[\s\S]{0,600}?if \(!legacySidebarEnabled\) \{\s*void startNewAgentDraft\(\);\s*return;\s*\}/u,
    );
    // From an unassigned draft there is no "current project" for newLocal.
    expect(chatRoute).toMatch(
      /if \(command === "chat\.newLocal"\) \{[\s\S]{0,500}?if \(isUnassignedDraft\(activeDraftThread\)\) \{\s*void startNewAgentDraft\(\);\s*return;\s*\}/u,
    );
  });

  it("reuses the live unassigned draft rather than minting a second one", () => {
    expect(hooks).toContain(
      "getDraftSessionByLogicalProjectKey(NEW_AGENT_DRAFT_LOGICAL_PROJECT_KEY)",
    );
    expect(hooks).toMatch(/existing\.promotedTo == null &&[\s\S]{0,200}?===\s*null/u);
    expect(hooks).toContain('to: "/draft/$draftId"');
  });

  it("keeps the unassigned draft out of the sidebar", () => {
    // No row until a project is chosen: a row needs a section to sit in, and
    // "Unknown project" would claim a choice the user has not made.
    expect(draftRows).toContain("if (isUnassignedDraft(draft)) continue;");
  });

  it("moves the draft when its project is chosen or changed", () => {
    // One logical mapping per draft is the store's rule; the pill only has
    // to remap. The chosen project's own defaults are seeded the way a fresh
    // draft in it would get them, and a promoted draft is never resurrected.
    expect(hooks).toContain(
      "setLogicalProjectDraftThreadId(entry.group.projectKey, projectRef, draftId, {",
    );
    expect(hooks).toContain("resolveDefaultThreadEnvMode({");
    expect(hooks).toContain("resolveNewDraftStartFromOrigin({");
    expect(hooks).toContain("if (!session || session.promotedTo != null) return;");
    expect(hooks).toContain("hasExplicitComposerModelSelection(getComposerDraft(draftId))");
  });

  it("replaces the draft hero's inline chooser with the project pill", () => {
    const override = readSibling("../overrides/components/chat/DraftHeroHeadline.tsx");
    expect(override).toContain("export function DraftHeroHeadline(");
    expect(override).toContain("<DraftProjectPill");
    // The props are upstream's, so ChatView's call site needs no fence.
    for (const prop of ["draftId", "activeProjectRef", "activeProjectTitle"]) {
      expect(override).toContain(`readonly ${prop}:`);
    }
    const pill = readSibling("../custom/DraftProjectPill.tsx");
    expect(pill).toContain('data-testid="draft-project-pill"');
    expect(pill).toContain("void assignDraftProject(props.draftId, entry);");
    // Same project list and member rule as the palette and the grouped header.
    expect(pill).toContain("buildSidebarProjectPickerEntries({");
  });

  it("opens Usage from the chrome's fourth row", () => {
    expect(chromeRows).toContain('label="Usage"');
    expect(sidebar).toContain('void router.navigate({ to: "/usage" });');
  });
});
