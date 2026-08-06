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
  rankOriginRules,
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

  describe("rankOriginRules", () => {
    it("puts the most likely winner last — that is the one the request names", () => {
      const ranked = rankOriginRules([
        candidate({ selectorText: "button", specificity: 1, order: 1 }),
        candidate({ selectorText: "[data-chip]", specificity: 100, order: 2 }),
      ]);
      expect(ranked.map((r) => r.selectorText)).toEqual(["button", "[data-chip]"]);
    });

    it("ranks !important above every non-important rule regardless of specificity", () => {
      const ranked = rankOriginRules([
        candidate({ selectorText: "#very .specific", specificity: 10_100, order: 1 }),
        candidate({ selectorText: "button", specificity: 1, order: 2, important: true }),
      ]);
      expect(ranked.at(-1)?.selectorText).toBe("button");
    });

    it("breaks a specificity tie on document order, like the cascade", () => {
      const ranked = rankOriginRules([
        candidate({ selectorText: ".late", specificity: 100, order: 9 }),
        candidate({ selectorText: ".early", specificity: 100, order: 2 }),
      ]);
      expect(ranked.at(-1)?.selectorText).toBe(".late");
    });

    it("drops the ranking-only fields from what callers see", () => {
      const [rule] = rankOriginRules([candidate({ stylesheet: "ComposerShell.css" })]);
      expect(rule).toEqual({
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
      rankOriginRules(input);
      expect(input.map((c) => c.selectorText)).toEqual(["b", "a"]);
    });
  });
});
