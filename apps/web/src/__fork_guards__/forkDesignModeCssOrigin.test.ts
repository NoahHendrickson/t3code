// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * Covers the DOM-free half of cssOrigin.ts. The probes (remove the class / apply the declared
 * value, re-measure) and the CSSOM walk need a live browser and are exercised by design mode
 * in the preview webview; this suite pins the parts that decide what the agent is ultimately
 * TOLD — which selector counts as the probed utility's own rule, and which rule gets named as
 * the culprit.
 */
import { describe, expect, it } from "vite-plus/test";

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

import {
  pickCulprit,
  roughSpecificity,
  singleClassName,
  type OriginCandidate,
} from "../custom/designMode/cssOrigin";

const candidate = (over: Partial<OriginCandidate>): OriginCandidate => ({
  selectorText: ".a",
  stylesheet: "app.css",
  important: false,
  layered: false,
  order: 0,
  specificity: 0,
  ...over,
});

describe("fork guard: design-mode css origin", () => {
  // Culprit exclusion is scoped to the PROBED utility's own rule, matched by this parse: any
  // broader dismissal (every carried class, every "utility-looking" selector) silenced the
  // plain-CSS `.composer-chip` culprit and competing-utility findings.
  describe("singleClassName", () => {
    it("extracts a lone class selector", () => {
      expect(singleClassName(".px-1")).toBe("px-1");
      expect(singleClassName("  .px-1  ")).toBe("px-1");
    });

    it("unescapes, so the parsed name matches its class-list form", () => {
      expect(singleClassName(".px-2\\.5")).toBe("px-2.5");
    });

    it("returns null for compound and pseudo-class selectors", () => {
      // These genuinely outrank a utility and must stay nameable as culprits.
      expect(singleClassName(".composer.compact")).toBeNull();
      expect(singleClassName(".chip:hover")).toBeNull();
      expect(singleClassName(".card .title")).toBeNull();
    });

    it("returns null for anything that is not a lone class selector", () => {
      expect(singleClassName("[data-fork-composer-mode-chip]")).toBeNull();
      expect(singleClassName("button.primary")).toBeNull();
      expect(singleClassName("#id")).toBeNull();
    });
  });

  describe("roughSpecificity", () => {
    it("orders id over attribute/class over bare type", () => {
      expect(roughSpecificity("#main")).toBeGreaterThan(roughSpecificity("[data-x]"));
      expect(roughSpecificity("[data-x]")).toBeGreaterThan(roughSpecificity("button"));
    });

    it("counts a compound selector above its parts", () => {
      expect(roughSpecificity(':root[data-fork="x"] [data-chip]')).toBeGreaterThan(
        roughSpecificity("[data-chip]"),
      );
    });
  });

  describe("pickCulprit", () => {
    it("names nothing when nothing matched", () => {
      expect(pickCulprit([])).toBeNull();
    });

    it("picks the more specific rule — that is the one the request names", () => {
      const culprit = pickCulprit([
        candidate({ selectorText: "button", specificity: 1, order: 1 }),
        candidate({ selectorText: "[data-chip]", specificity: 100, order: 2 }),
      ]);
      expect(culprit?.selectorText).toBe("[data-chip]");
    });

    it("puts an unlayered rule above a layered one of higher specificity", () => {
      // The trap this whole module exists for: in Tailwind v4 utilities are in
      // `@layer utilities`, so an unlayered fork rule wins however plain its selector.
      const culprit = pickCulprit([
        candidate({ selectorText: "#specific .thing", specificity: 10_100, layered: true }),
        candidate({ selectorText: "[data-chip]", specificity: 100, layered: false, order: 1 }),
      ]);
      expect(culprit?.selectorText).toBe("[data-chip]");
    });

    it("puts !important above every non-important rule regardless of specificity", () => {
      const culprit = pickCulprit([
        candidate({ selectorText: "#very .specific", specificity: 10_100, order: 1 }),
        candidate({ selectorText: "button", specificity: 1, order: 2, important: true }),
      ]);
      expect(culprit?.selectorText).toBe("button");
    });

    it("breaks a specificity tie on document order, like the cascade", () => {
      const culprit = pickCulprit([
        candidate({ selectorText: ".late", specificity: 100, order: 9 }),
        candidate({ selectorText: ".early", specificity: 100, order: 2 }),
      ]);
      expect(culprit?.selectorText).toBe(".late");
    });

    it("keeps the first of two candidates equal in all three tiebreaks", () => {
      const culprit = pickCulprit([
        candidate({ selectorText: ".first", specificity: 100, order: 3 }),
        candidate({ selectorText: ".second", specificity: 100, order: 3 }),
      ]);
      expect(culprit?.selectorText).toBe(".first");
    });

    it("drops the selection-only fields from what callers see", () => {
      // `order` and `specificity` are selection-only and must not leak; `layered` is part of
      // the reported rule because it is why the rule wins.
      expect(pickCulprit([candidate({ stylesheet: "ComposerShell.css" })])).toEqual({
        selectorText: ".a",
        stylesheet: "ComposerShell.css",
        important: false,
        layered: false,
      });
    });

    it("does not mutate the caller's array", () => {
      const input = [
        candidate({ selectorText: "b", specificity: 200, order: 1 }),
        candidate({ selectorText: "a", specificity: 1, order: 2 }),
      ];
      pickCulprit(input);
      expect(input.map((c) => c.selectorText)).toEqual(["b", "a"]);
    });
  });

  // Read as text rather than imported: guardrails.ts lives inside the engine's TS island,
  // which apps/web's project excludes, so an import here fails to type-check (TS6307).
  const guardrails = NodeFS.readFileSync(
    NodeURL.fileURLToPath(
      new URL("../custom/designMode/engine/vendor/shared/guardrails.ts", import.meta.url),
    ),
    "utf8",
  );

  // Re-sync durability: upstream's wording promises "The Forge verifies the changes
  // automatically", which is false in this fork — client/verifier.ts was never vendored, so
  // nothing checks. A faithful re-sync would restore that sentence and silently tell the agent
  // to stop looking exactly where a no-op edit surfaces. Delete this only alongside a vendored
  // verifier.
  describe("NO_PREVIEW_GUARDRAIL", () => {
    const noPreview = /export const NO_PREVIEW_GUARDRAIL\s*=\s*'([^']*)'/u.exec(guardrails)?.[1];

    it("is found in the vendored source", () => {
      expect(noPreview).toBeTruthy();
    });

    it("does not claim an automatic verifier this fork has not vendored", () => {
      expect(noPreview).not.toMatch(/verif/iu);
    });

    it("still tells the agent not to spin up its own preview", () => {
      expect(noPreview).toMatch(/Do not run the app/u);
    });
  });

  // Re-sync durability, same shape as NO_PREVIEW's: upstream scopes every edit to its call
  // site and tells the agent to SKIP shared-component changes. This fork inverts that —
  // selecting a Button and nudging its padding usually means "the Button", so the agent
  // judges component-wide vs one-off from the request's component/source context and says
  // which it chose. A faithful re-sync would silently restore the skip-and-report wording
  // and turn design edits back into call-site overrides.
  describe("SCOPE_GUARDRAIL", () => {
    const scope = /export const SCOPE_GUARDRAIL\s*=\s*'([^']*)'/u.exec(guardrails)?.[1];

    it("is found in the vendored source", () => {
      expect(scope).toBeTruthy();
    });

    it("no longer instance-locks or skips shared-component edits", () => {
      expect(scope).not.toMatch(/apply to this call site only/u);
      expect(scope).not.toMatch(/skip it/u);
    });

    it("asks the agent to judge component-wide vs one-off and disclose its choice", () => {
      expect(scope).toMatch(/judge/u);
      expect(scope).toMatch(/component/u);
      expect(scope).toMatch(/instance/u);
      expect(scope).toMatch(/which scope you chose/u);
    });

    it("keeps the no-pause rule and the token preference", () => {
      expect(scope).toMatch(/Do not pause/u);
      expect(scope).toMatch(/tokens/u);
    });
  });
});
