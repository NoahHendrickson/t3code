/** Fork guard — see `.fork/customizations.yaml#fork-design-mode`.
 *
 * Covers the DOM-free half of cssOrigin.ts. The probe itself (remove the class, re-measure)
 * and the CSSOM walk need a live browser and are exercised by design mode in the preview
 * webview; this suite pins the parts that decide what the agent is ultimately TOLD — which
 * selectors are dismissed as utilities, and which rule gets named as the culprit.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  isBareClassSelector,
  pickCulprit,
  roughSpecificity,
  type OriginCandidate,
} from "../custom/designMode/cssOrigin";

const candidate = (over: Partial<OriginCandidate>): OriginCandidate => ({
  selectorText: ".a",
  stylesheet: "app.css",
  important: false,
  order: 0,
  specificity: 0,
  ...over,
});

describe("fork guard: design-mode css origin", () => {
  describe("isBareClassSelector", () => {
    it("dismisses single-class utility selectors", () => {
      // Naming `.px-1` as the culprit for a padding change is a tautology, not a lead.
      expect(isBareClassSelector(".px-1")).toBe(true);
      expect(isBareClassSelector(".px-2\\.5")).toBe(true);
      expect(isBareClassSelector("  .gap-1.5  ".trim())).toBe(true);
    });

    it("keeps anything that could actually outrank a utility", () => {
      expect(isBareClassSelector("[data-fork-composer-mode-chip]")).toBe(false);
      expect(isBareClassSelector(':root[data-fork="x"] [data-fork-composer-mode-chip]')).toBe(
        false,
      );
      expect(isBareClassSelector(".card .title")).toBe(false);
      expect(isBareClassSelector("button.primary")).toBe(false);
      expect(isBareClassSelector("#id")).toBe(false);
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
      expect(pickCulprit([candidate({ stylesheet: "ComposerShell.css" })])).toEqual({
        selectorText: ".a",
        stylesheet: "ComposerShell.css",
        important: false,
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
});
