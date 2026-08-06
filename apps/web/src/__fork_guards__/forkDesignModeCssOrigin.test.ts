// @effect-diagnostics nodeBuiltinImport:off
/** Fork guard — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * Covers the DOM-free half of cssOrigin.ts. The probe itself (remove the class, re-measure)
 * and the CSSOM walk need a live browser and are exercised by design mode in the preview
 * webview; this suite pins the parts that decide what the agent is ultimately TOLD — which
 * selectors are dismissed as utilities, and which rule gets named as the culprit.
 */
import { describe, expect, it } from "vite-plus/test";

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

import {
  isTautologicalSelector,
  pickCulprit,
  roughSpecificity,
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

/** Stand-in for the element's own class list — the only thing the tautology test consults. */
const classes = (...names: string[]): DOMTokenList =>
  ({ contains: (name: string) => names.includes(name) }) as DOMTokenList;

describe("fork guard: design-mode css origin", () => {
  describe("isTautologicalSelector", () => {
    it("dismisses a single class the element already carries", () => {
      // Naming `.px-1` as the culprit for a padding change is a tautology, not a lead.
      expect(isTautologicalSelector(".px-1", classes("px-1"))).toBe(true);
      expect(isTautologicalSelector("  .px-1  ", classes("px-1"))).toBe(true);
    });

    it("unescapes before comparing, so escaped utilities are still dismissed", () => {
      expect(isTautologicalSelector(".px-2\\.5", classes("px-2.5"))).toBe(true);
    });

    it("keeps a single-class rule the element does NOT carry", () => {
      // A plain-CSS guest project's `.composer-chip { padding: 8px }` is the likeliest culprit
      // there; dismissing every single-class selector hid exactly that case.
      expect(isTautologicalSelector(".composer-chip", classes("px-1"))).toBe(false);
    });

    it("keeps compound and pseudo-class selectors even when the element has both classes", () => {
      // These genuinely outrank a utility. The previous regex let unescaped `.` and `:` into
      // its character class, so it swallowed them as "bare".
      expect(isTautologicalSelector(".composer.compact", classes("composer", "compact"))).toBe(
        false,
      );
      expect(isTautologicalSelector(".chip:hover", classes("chip"))).toBe(false);
      expect(isTautologicalSelector(".card .title", classes("card", "title"))).toBe(false);
    });

    it("keeps anything that is not a lone class selector", () => {
      expect(isTautologicalSelector("[data-fork-composer-mode-chip]", classes())).toBe(false);
      expect(isTautologicalSelector("button.primary", classes("primary"))).toBe(false);
      expect(isTautologicalSelector("#id", classes())).toBe(false);
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

  // Re-sync durability: upstream's wording promises "The Forge verifies the changes
  // automatically", which is false in this fork — client/verifier.ts was never vendored, so
  // nothing checks. A faithful re-sync would restore that sentence and silently tell the agent
  // to stop looking exactly where a no-op edit surfaces. Delete this only alongside a vendored
  // verifier.
  describe("NO_PREVIEW_GUARDRAIL", () => {
    // Read as text rather than imported: guardrails.ts lives inside the engine's TS island,
    // which apps/web's project excludes, so an import here fails to type-check (TS6307).
    const guardrails = NodeFS.readFileSync(
      NodeURL.fileURLToPath(
        new URL("../custom/designMode/engine/vendor/shared/guardrails.ts", import.meta.url),
      ),
      "utf8",
    );
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
});
