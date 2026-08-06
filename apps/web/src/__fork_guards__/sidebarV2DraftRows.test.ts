// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-draft-rows`.
 *
 * Projection helpers are tested next to the module. This file guards only the
 * seam inside upstream's `SidebarV2.tsx`: drafts enter the active partition,
 * draft cards navigate to `/draft/$draftId`, the open draft highlights, and
 * server lifecycle actions stay off the row.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const sidebar = readSibling("../components/SidebarV2.tsx");

describe("fork guard: sidebar-v2-draft-rows", () => {
  it("folds unpromoted drafts into the active partition", () => {
    expect(sidebar).toContain("listSidebarDraftRows");
    expect(sidebar).toContain("draftThreadsByThreadKey");
    expect(sidebar).toContain("for (const row of draftRows)");
    expect(sidebar).toContain("active.push(shell)");
    // Unsent composer text becomes the card title when the route changes —
    // getState() so keystrokes do not rebuild the partition.
    expect(sidebar).toContain("promptForDraft:");
    expect(sidebar).toContain("getComposerDraft(draftId)?.prompt");
    expect(sidebar).toContain("sidebarDraftModelSelection({");
    expect(sidebar).toContain("routeThreadKey");
  });

  it("opens draft cards on the draft route and highlights the reserved thread", () => {
    expect(sidebar).toContain('to: "/draft/$draftId"');
    expect(sidebar).toContain("buildDraftThreadRouteParams(draftId)");
    // Unpromoted drafts: reserved thread id, not wait-for-promotedTo.
    expect(sidebar).toContain(
      "return scopeThreadRef(routeDraftThread.environmentId, routeDraftThread.threadId)",
    );
  });

  it("keeps settle/snooze/rename off drafts and offers discard", () => {
    // Capabilities from one helper at the list boundary — not four gates.
    expect(sidebar).toContain("sidebarDraftRowCapabilities(");
    expect(sidebar).toContain("sidebarServerActionThreadKeys({");
    expect(sidebar).toContain("draftCaps.canSettle &&");
    expect(sidebar).toContain("draftCaps.canSnooze &&");
    expect(sidebar).toContain("onDiscardDraft={draftCaps.showDiscard ? discardDraftThread : null}");
    expect(sidebar).toContain('id: "discard-draft"');
    expect(sidebar).toContain("discardDraftThread");
    expect(sidebar).toContain('aria-label="Discard draft"');
    expect(sidebar).toContain(
      "if (draftIdByThreadKeyRef.current.has(scopedThreadKey(threadRef))) return;",
    );
    // Neighbor pick is pure; navigate reuses navigateToThread({ replace }).
    expect(sidebar).toContain("pickDiscardNeighborKey({");
    expect(sidebar).toContain("await navigateToThread(");
    expect(sidebar).not.toMatch(/discardDraftThread[\s\S]{0,800}handleNewThreadRef\.current/u);
    const discardStart = sidebar.indexOf("const discardDraftThread = useCallback(");
    expect(discardStart).toBeGreaterThanOrEqual(0);
    const discardBody = sidebar.slice(
      discardStart,
      sidebar.indexOf("/* fork:end sidebar-v2-draft-rows */", discardStart),
    );
    expect(discardBody).toContain("replace: true");
    expect(discardBody.indexOf("await navigateToThread(")).toBeLessThan(
      discardBody.indexOf("clearDraftThread(draftId)"),
    );
  });

  it("computes trailing hover actions once on the card", () => {
    // Declared after showSnoozeButton so typecheck accepts the reference.
    expect(sidebar).toContain(
      "props.settlementSupported || props.pinningSupported || showSnoozeButton || showDiscardDraft;",
    );
    expect(sidebar).toContain("hasHoverActions ||");
    expect(sidebar).toContain("hasHoverActions &&");
    expect(sidebar).toContain("{hasHoverActions ? (");
  });
});
