// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * The sent-preview RESOLUTION contract: what the panel leads with once a design-mode send's
 * turn has settled, and what looking at the live page is allowed to cost. The rest of design
 * mode is pinned by `forkDesignMode.test.ts`; this contract earns its own file because it is
 * the one place the feature is tempted to either invent a claim or destroy the user's work.
 *
 * The behavioural half — which summaries count as a contradiction — is a pure exported
 * predicate tested in `designSentPreviews.test.ts`. This suite pins the wiring that predicate
 * cannot defend on its own.
 */
import { describe, expect, it } from "vite-plus/test";

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { isMeasuredContradiction } from "../custom/designMode/designSentPreviews";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");
const read = (relative: string) => NodeFS.readFileSync(NodePath.join(webRoot, relative), "utf8");

describe("fork guard: design-mode sent-preview resolution", () => {
  it("leads with the live-page invitation, and reports only a measured contradiction", () => {
    const panel = read("src/custom/designMode/panel/SentPreviewResolution.tsx");

    // The contradiction policy is verify VOCABULARY, not presentation: it lives beside
    // verifySummaryLine and the label map, so the panel asks the question rather than
    // re-deciding it. A JSX-local boolean here would put the feature's central judgement
    // somewhere no other surface could reuse or a unit test could reach.
    expect(panel).toContain("isMeasuredContradiction(measured.summary)");
    expect(panel).not.toMatch(/const\s+measuredFailure\s*=/);
    expect(panel).toContain('<Alert variant="success"');
    expect(panel).toContain("View live changes");

    // Waiting folds into the invitation deliberately, which is what makes the report path's
    // measurement non-null by construction. If a future edit reintroduces a nullable summary
    // there, these dead arms come back with it — so pin their absence.
    expect(panel).not.toContain("Edits from a sent request are still previewed");
    expect(panel).not.toMatch(/variant=\{summary \? /);

    // The selective resolution stays REACHABLE for a mixed report (applied beside
    // unverifiable). Losing it would leave a user whose change partly landed choosing
    // between restoring every preview and discarding every edit on the tab.
    expect(panel).toContain("const landed = measured?.summary.applied ?? 0");
    expect(panel).toContain("{landed > 0 ? (");
  });

  it("makes looking at the live page a peek that no exit can turn into data loss", () => {
    const panel = read("src/custom/designMode/panel/SentPreviewResolution.tsx");

    // Looking suppresses the drafts; it never destroys them, so an ask the agent missed can
    // still be re-sent from the drafts the user already made.
    expect(panel).toContain("onSetComparing(true)");
    expect(panel).not.toContain("designModeBridge.discardAll");

    // ONE peek exit, covering routes this component does not own — the footer's Before/After
    // and the mutation gate's leave-compare both leave compare without touching this block,
    // and before the effect existed either one left the invitation to reappear over a page
    // the user had already inspected.
    expect(panel).toContain("const peeked = useRef(false)");
    expect(panel).toContain("}, [offer, comparing, runtimeTabId]);");
    expect(panel).toContain("useDesignSentPreviews.getState().forget(runtimeTabId)");

    // A late contradiction can swap this block from peek to report mid-look, so the report's
    // own keep-exit restores the page: answering "keep previews" while they are still
    // suppressed leaves the page contradicting the button just pressed.
    expect(panel).toMatch(/const onKeep = useCallback\(\(\) => \{\s*onSetComparing\(false\);/);
  });

  it("keeps compare to a single host writer", () => {
    // The whole point of the panel's setComparing: the guest, the host flag and the
    // Before/After label cannot disagree about what the page is showing. The block drives it
    // through the panel rather than reaching for the bridge...
    const panel = read("src/custom/designMode/panel/SentPreviewResolution.tsx");
    expect(panel).not.toContain("designModeBridge.compareAll");

    // ...and the panel itself has exactly one bridge compare call — inside setComparing. The
    // mutation gate's leave-compare rule and Discard both route through it rather than
    // carrying their own copy of the write pair.
    const forkPanel = read("src/custom/designMode/panel/ForkDesignPanel.tsx");
    expect(forkPanel.match(/designModeBridge\.compareAll\(/g)).toHaveLength(1);
    expect(forkPanel.match(/useDesignModeStore\.getState\(\)\.setComparing\(/g)).toHaveLength(1);
    expect(forkPanel).toContain("if (comparingRef.current) setComparing(false);");
    expect(forkPanel).toContain("comparing={tab.comparing}");
    expect(forkPanel).toContain("onSetComparing={setComparing}");
  });

  it("counts only measured contradictions, never absences of evidence", () => {
    const summary = {
      applied: 0,
      unchanged: 0,
      diverged: 0,
      unverifiable: 0,
      missing: 0,
    };
    // Nothing read yet is not a reading.
    expect(isMeasuredContradiction(null)).toBe(false);
    // The outcomes that made a landed change read as broken.
    expect(isMeasuredContradiction({ ...summary, applied: 3 })).toBe(false);
    expect(isMeasuredContradiction({ ...summary, unverifiable: 1 })).toBe(false);
    expect(isMeasuredContradiction({ ...summary, missing: 1 })).toBe(false);
    expect(isMeasuredContradiction({ ...summary, applied: 1, unverifiable: 1 })).toBe(false);
    // The page provably does not render what was asked.
    expect(isMeasuredContradiction({ ...summary, unchanged: 1 })).toBe(true);
    expect(isMeasuredContradiction({ ...summary, diverged: 1 })).toBe(true);
    expect(isMeasuredContradiction({ ...summary, applied: 2, diverged: 1 })).toBe(true);
  });
});
