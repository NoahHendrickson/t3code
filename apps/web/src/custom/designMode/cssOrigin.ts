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
 *    class and re-measuring. That is ground truth for the cases it can decide: no cascade
 *    emulation to get wrong, and it accounts for layers, `!important` and specificity at once.
 *    It cannot decide a TIE — if another declaration carries the same value, removing the class
 *    moves nothing, and "the class is inert" and "the class wins but is shadowed" look
 *    identical. That case is reported as ambiguous rather than guessed at.
 * 2. "Then what else declares it?" — answered by walking the stylesheets for matching rules.
 *    Used to name a culprit, and to turn a tie into an honest "both of these declare it".
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
  /** Inside an `@layer`. Unlayered normal declarations beat layered ones outright, which is
   * why this ranks above specificity — the trap that made a `px-*` utility (layered, in
   * Tailwind v4) lose to an unlayered fork rule of far lower specificity. */
  layered: boolean;
}

export interface DeclarationOrigin {
  /** The probe proved `utilityClass` is what resolves this property. */
  utilityWins: boolean;
  /** The probe could not tell: removing the class did not move the value, which happens both
   * when the class is inert AND when something else declares the same value. Callers must not
   * claim the utility is overridden on this basis. */
  ambiguous: boolean;
  /** The probed class, echoed back so callers need not re-derive it. Null when no class on the
   * element looked relevant — in which case no probe ran and `utilityWins` is meaningless. */
  utilityClass: string | null;
  /** The element's own inline style declares this property, which outranks every stylesheet
   * rule below. Named separately because "edit that rule" is the wrong instruction for it. */
  inlineStyle: boolean;
  /** The rule worth naming, best-effort. Null when nothing could be named. */
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

const SINGLE_CLASS_SELECTOR = /^\.((?:[^\\.:[\s>+~,()]|\\.)+)$/;

/**
 * Whether a selector is a tautology for this element: a single class that the element already
 * carries, i.e. one of its own utilities. Naming `.px-1` as the culprit for a padding change
 * tells the agent nothing it did not already have.
 *
 * Deliberately narrower than "looks like a utility". A plain-CSS guest project's
 * `.composer-chip { padding: 8px }` is a single-class selector AND the most likely culprit
 * there, so it must survive — it is only dismissed when the class is the element's own. And
 * `.a.b` / `.a:hover` are not single-class at all: they genuinely outrank a utility and were
 * previously discarded by a regex whose character class let unescaped `.` and `:` through.
 */
export function isTautologicalSelector(selectorText: string, classList: DOMTokenList): boolean {
  const match = SINGLE_CLASS_SELECTOR.exec(selectorText.trim());
  if (!match) return false;
  const raw = match[1];
  if (raw === undefined) return false;
  return classList.contains(raw.replace(/\\(.)/g, "$1"));
}

/** A matched rule before selection. Split out so the choice can be tested without a DOM:
 * everything that needs live CSSOM produces these, everything after is arithmetic. */
export interface OriginCandidate extends OriginRule {
  order: number;
  specificity: number;
}

/** True when `a` outranks `b`. Tiers, strongest first: `!important`, then unlayered over
 * layered, then approximate specificity, then document order. The layer tier is why a
 * low-specificity unlayered rule correctly beats a Tailwind utility. Known gap: for
 * `!important` declarations the layer order inverts, which is not modelled — the important
 * tier already dominates, so the two only interact between competing important rules. */
function outranks(a: OriginCandidate, b: OriginCandidate): boolean {
  if (a.important !== b.important) return a.important;
  if (a.layered !== b.layered) return !a.layered;
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
  const { selectorText, stylesheet, important, layered } = best;
  return { selectorText, stylesheet, important, layered };
}

/** `@media` verdicts, memoised per walk: a Tailwind dev sheet repeats a handful of breakpoint
 * strings across thousands of rules, and each `matchMedia` call parses afresh. */
type MediaCache = Map<string, boolean>;

function mediaMatches(condition: string, cache: MediaCache): boolean {
  const cached = cache.get(condition);
  if (cached !== undefined) return cached;
  const result = window.matchMedia(condition).matches;
  cache.set(condition, result);
  return result;
}

/**
 * Every style rule in the document that matches `el`, with the layer and ordering context
 * needed to rank it. ONE walk per element serves every changed property — the walk, not the
 * per-property filtering, is what costs on a 30k-rule dev sheet.
 */
function collectMatchingRules(el: Element): Array<OriginCandidate & { style: CSSStyleDeclaration }> {
  const found: Array<OriginCandidate & { style: CSSStyleDeclaration }> = [];
  const mediaCache: MediaCache = new Map();
  const classList = el.classList;
  let order = 0;

  const visit = (rules: CSSRuleList, sheet: CSSStyleSheet, layered: boolean): void => {
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (!rule) continue;
      order += 1;

      // A CSSStyleRule has BOTH declarations and (since CSS Nesting, Chrome 112+) a `cssRules`
      // list — which is an empty CSSRuleList object, and therefore truthy. Testing `cssRules`
      // first sent every ordinary rule down the grouping branch and skipped its declarations,
      // so nothing was ever collected. Style rules are handled first, and then still descended
      // into for their nested children.
      if (rule instanceof CSSStyleRule) {
        const selectorText = rule.selectorText;
        // Cheapest rejects first: string work and a classList lookup before any CSSOM read,
        // and `matches()` — the expensive one — only for rules that survive.
        if (typeof selectorText === "string" && !isTautologicalSelector(selectorText, classList)) {
          let matched = false;
          try {
            matched = el.matches(selectorText);
          } catch {
            matched = false; // selector the matcher rejects (::part, vendor pseudos)
          }
          if (matched) {
            found.push({
              selectorText,
              stylesheet: stylesheetLabel(sheet),
              important: false, // per-property, filled in by the caller
              layered,
              order,
              specificity: roughSpecificity(selectorText),
              style: rule.style,
            });
          }
        }
        if (rule.cssRules.length > 0) visit(rule.cssRules, sheet, layered);
        continue;
      }

      // `@media` is the only grouping rule whose condition can be evaluated here. Everything
      // else — `@supports`, `@container`, `@layer` — is descended into unconditionally: the
      // previous code routed them through `matchMedia` inside a `try`, but `matchMedia` never
      // throws (an unparseable condition yields `not all`, `matches: false`), so those blocks
      // were silently dropped instead of falling through as the comment claimed. `@container`
      // is worse than dropped there: it parses as a valid viewport query and gets answered
      // against the window rather than the container.
      if (rule instanceof CSSMediaRule) {
        if (!mediaMatches(rule.conditionText, mediaCache)) continue;
        visit(rule.cssRules, sheet, layered);
        continue;
      }
      if (rule instanceof CSSGroupingRule) {
        const nowLayered =
          layered || (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule);
        visit(rule.cssRules, sheet, nowLayered);
      }
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      // Cross-origin sheets throw on access; they cannot be authored by this project anyway.
      const rules = sheet.cssRules;
      if (rules) visit(rules, sheet, false);
    } catch {
      continue;
    }
  }
  return found;
}

/** Whether removing `utilityClass` moves the property's computed value. Transitions are
 * suppressed across the probe: mid-transition `getComputedStyle` returns the animating value,
 * which would read as a difference the class did not cause. `before` is passed in — the caller
 * has already measured it, and re-measuring here would double the forced style recalcs. */
function classMovesProperty(
  el: Element,
  property: string,
  utilityClass: string,
  before: string,
): boolean {
  const style = (el as HTMLElement).style;
  const inlineTransition = style?.getPropertyValue("transition") ?? "";
  style?.setProperty("transition", "none");
  try {
    el.classList.remove(utilityClass);
    return getComputedStyle(el).getPropertyValue(property) !== before;
  } catch {
    return false;
  } finally {
    el.classList.add(utilityClass);
    if (inlineTransition) style?.setProperty("transition", inlineTransition);
    else style?.removeProperty("transition");
  }
}

/**
 * Resolves what controls each of `properties` on `el`, in one CSSOM walk.
 *
 * `measured` supplies the already-taken computed value per property, so the probe costs one
 * forced recalc rather than two. `utilityFor` is the builder's existing class-list guess; the
 * probe either confirms it, demotes it, or reports that it could not tell.
 */
export function resolveDeclarationOrigins(
  el: Element,
  properties: Iterable<string>,
  measured: ReadonlyMap<string, string>,
  utilityFor: (property: string) => string | null,
): Map<string, DeclarationOrigin> {
  const matching = collectMatchingRules(el);
  const inline = (el as HTMLElement).style;
  const out = new Map<string, DeclarationOrigin>();

  for (const property of properties) {
    const utilityClass = utilityFor(property);
    const before = measured.get(property) ?? getComputedStyle(el).getPropertyValue(property);
    const canProbe = utilityClass !== null && el.classList.contains(utilityClass);
    const moved = canProbe && classMovesProperty(el, property, utilityClass, before);

    const candidates = matching
      .filter((candidate) => declaresProperty(candidate.style, property))
      .map((candidate) => ({ ...candidate, important: isImportant(candidate.style, property) }));

    out.set(property, {
      utilityWins: moved,
      // Only a probe that ran and did not move the value is ambiguous. No probe at all is not
      // ambiguity — it is simply the absence of a utility to talk about.
      ambiguous: canProbe && !moved,
      utilityClass,
      inlineStyle: inline?.getPropertyValue(property) !== "" && inline?.getPropertyValue(property) !== undefined,
      culprit: moved ? null : pickCulprit(candidates),
    });
  }
  return out;
}
