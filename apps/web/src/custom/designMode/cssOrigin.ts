/**
 * Which declaration actually produces a property's measured value.
 *
 * The change-request builder used to name a lever by scanning the element's class list
 * (`findExistingUtility`) and asking the agent to "change `px-2.5` → `px-1`". That scan
 * only proves a class with the right prefix is PRESENT — not that it is what the browser
 * resolved the property from. When a stylesheet rule outranks the utility, the agent edits
 * a class that changes nothing, and the no-op only surfaces when the user notices the live
 * app is unchanged. (Real case: `[data-fork-composer-mode-chip]` in ComposerShell.css pins
 * `padding-inline: 8px`, so the drafted 4px never landed via `px-1`.)
 *
 * Two questions, answered separately because they want different tools:
 *
 * 1. "Does the utility class control this property?" — answered EMPIRICALLY, by removing the
 *    class and re-measuring. That is ground truth: no cascade emulation to get wrong, and it
 *    naturally accounts for layers, `!important`, `@media`, and specificity all at once.
 * 2. "Then what does control it?" — answered BEST-EFFORT, by walking the stylesheets for
 *    matching rules that declare the property. Used only to name a culprit for the agent, so
 *    an approximate ordering is fine; question 1 already decided the phrasing.
 *
 * Callers must probe while the element shows its ORIGINAL cascade (drafts compared back on).
 * With a draft applied as inline style the probe would measure the draft, conclude the class
 * is inert, and report the opposite of the truth.
 */

/** A stylesheet rule that matches the element and declares the property. */
export interface OriginRule {
  selectorText: string;
  /** Basename of the owning file where derivable, else `<style>`. */
  stylesheet: string;
  important: boolean;
}

export interface DeclarationOrigin {
  /** Whether `utilityClass` is what the browser actually resolves this property from. */
  utilityWins: boolean;
  /** The probed class, echoed back so callers need not re-derive it. */
  utilityClass: string | null;
  /** The one rule worth naming when the utility does not win. Null when the utility wins, or
   * when nothing could be named — the request renders a single hint, and the empirical probe
   * above, not this, is what decides the phrasing. */
  culprit: OriginRule | null;
}

/** Longhands a rule may declare through a shorthand instead. Only the shorthands whose
 * longhands the design panel actually drafts — a full CSS shorthand table is not the point. */
const SHORTHANDS: Record<string, readonly string[]> = {
  "padding-inline": ["padding"],
  "padding-block": ["padding"],
  "padding-top": ["padding", "padding-block"],
  "padding-bottom": ["padding", "padding-block"],
  "padding-left": ["padding", "padding-inline"],
  "padding-right": ["padding", "padding-inline"],
  "margin-inline": ["margin"],
  "margin-block": ["margin"],
  "margin-top": ["margin", "margin-block"],
  "margin-bottom": ["margin", "margin-block"],
  "margin-left": ["margin", "margin-inline"],
  "margin-right": ["margin", "margin-inline"],
  "row-gap": ["gap"],
  "column-gap": ["gap"],
  "border-top-left-radius": ["border-radius"],
  "border-top-right-radius": ["border-radius"],
  "border-bottom-left-radius": ["border-radius"],
  "border-bottom-right-radius": ["border-radius"],
};

export function declaresProperty(style: CSSStyleDeclaration, property: string): boolean {
  if (style.getPropertyValue(property) !== "") return true;
  for (const shorthand of SHORTHANDS[property] ?? []) {
    if (style.getPropertyValue(shorthand) !== "") return true;
  }
  return false;
}

function isImportant(style: CSSStyleDeclaration, property: string): boolean {
  if (style.getPropertyPriority(property) === "important") return true;
  for (const shorthand of SHORTHANDS[property] ?? []) {
    if (style.getPropertyPriority(shorthand) === "important") return true;
  }
  return false;
}

/** Approximate specificity, used only to order culprits in the report. `:where()` zeroing and
 * `:is()`/`:not()` argument weighting are not modelled — a parser's worth of code to reorder a
 * hint the agent reads in full anyway. */
export function roughSpecificity(selectorText: string): number {
  const ids = (selectorText.match(/#[\w-]/g) ?? []).length;
  const classes = (selectorText.match(/[.[]|:(?!:)/g) ?? []).length;
  const types = (selectorText.match(/(^|[\s>+~])[a-zA-Z]/g) ?? []).length;
  return ids * 10_000 + classes * 100 + types;
}

/** Vite dev serves CSS through `<style data-vite-dev-id="/abs/path.css">`, which is the only
 * place the authored filename survives — `sheet.href` is null for injected styles. */
function stylesheetLabel(sheet: CSSStyleSheet): string {
  const node = sheet.ownerNode;
  if (node instanceof Element) {
    const devId = node.getAttribute("data-vite-dev-id");
    if (devId) return devId.split("/").pop() ?? devId;
  }
  if (sheet.href) return sheet.href.split("/").pop() ?? sheet.href;
  return "<style>";
}

/** A selector that is nothing but one class — i.e. a utility. Named separately so culprit
 * reporting can drop them: "`.px-1` sets padding" tells the agent nothing it did not ask for. */
export function isBareClassSelector(selectorText: string): boolean {
  return /^\.[\w\\.:%[\]/-]+$/.test(selectorText.trim());
}

/** A matched rule before selection. Split out so the choice can be tested without a DOM:
 * everything above this point needs live CSSOM, everything below is arithmetic. */
export interface OriginCandidate extends OriginRule {
  order: number;
  specificity: number;
}

/** True when `a` outranks `b` by the cascade's tiebreak sequence: `!important` first, then
 * approximate specificity, then document order. */
function outranks(a: OriginCandidate, b: OriginCandidate): boolean {
  if (a.important !== b.important) return a.important;
  if (a.specificity !== b.specificity) return a.specificity > b.specificity;
  return a.order > b.order;
}

/** The single most likely winner among candidates, or null when there are none. Exported in
 * its own right because it is the only part of culprit selection testable without a DOM. */
export function pickCulprit(candidates: readonly OriginCandidate[]): OriginRule | null {
  let best: OriginCandidate | null = null;
  for (const candidate of candidates) {
    if (best === null || outranks(candidate, best)) best = candidate;
  }
  if (best === null) return null;
  const { selectorText, stylesheet, important } = best;
  return { selectorText, stylesheet, important };
}

function collectCulprit(el: Element, property: string): OriginRule | null {
  const found: OriginCandidate[] = [];
  let order = 0;

  const visit = (rules: CSSRuleList, sheet: CSSStyleSheet): void => {
    for (const rule of Array.from(rules)) {
      order += 1;
      // Grouping rules (@media, @supports, @layer, @container) hold nested rules. Descend
      // only when the condition currently holds, so a non-matching breakpoint is not blamed.
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested) {
        const condition = (rule as CSSMediaRule).conditionText;
        if (condition) {
          try {
            if (!window.matchMedia(condition).matches) continue;
          } catch {
            // @supports/@container conditions are not media queries — descend rather than
            // silently drop a rule that may well be the culprit.
          }
        }
        visit(nested, sheet);
        continue;
      }
      const style = (rule as CSSStyleRule).style;
      const selectorText = (rule as CSSStyleRule).selectorText;
      if (!style || typeof selectorText !== "string") continue;
      if (!declaresProperty(style, property)) continue;
      if (isBareClassSelector(selectorText)) continue;
      try {
        if (!el.matches(selectorText)) continue;
      } catch {
        continue; // selector the engine's matcher rejects (::part, vendor pseudos)
      }
      found.push({
        selectorText,
        stylesheet: stylesheetLabel(sheet),
        important: isImportant(style, property),
        order,
        specificity: roughSpecificity(selectorText),
      });
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      // Cross-origin sheets throw on access; they cannot be authored by this project anyway.
      if (sheet.cssRules) visit(sheet.cssRules, sheet);
    } catch {
      continue;
    }
  }

  return pickCulprit(found);
}

/** Whether removing `utilityClass` changes the property's computed value. Transitions are
 * suppressed across the probe: mid-transition `getComputedStyle` returns the animating value,
 * which would read as a difference the class did not cause. */
function classControlsProperty(el: Element, property: string, utilityClass: string): boolean {
  const style = (el as HTMLElement).style;
  const inlineTransition = style?.getPropertyValue("transition") ?? "";
  style?.setProperty("transition", "none");
  try {
    const before = getComputedStyle(el).getPropertyValue(property);
    el.classList.remove(utilityClass);
    const without = getComputedStyle(el).getPropertyValue(property);
    return before !== without;
  } catch {
    return false;
  } finally {
    el.classList.add(utilityClass);
    if (inlineTransition) style?.setProperty("transition", inlineTransition);
    else style?.removeProperty("transition");
  }
}

/**
 * Resolves what controls `property` on `el`. `utilityClass` is the builder's existing guess
 * (may be null when no class looked relevant); the probe either confirms it or demotes it.
 */
export function resolveDeclarationOrigin(
  el: Element,
  property: string,
  utilityClass: string | null,
): DeclarationOrigin {
  const utilityWins =
    utilityClass !== null &&
    el.classList.contains(utilityClass) &&
    classControlsProperty(el, property, utilityClass);
  if (utilityWins) return { utilityWins: true, utilityClass, culprit: null };
  return { utilityWins: false, utilityClass, culprit: collectCulprit(el, property) };
}
