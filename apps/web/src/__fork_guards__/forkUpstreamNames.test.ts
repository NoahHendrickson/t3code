// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-upstream-names`.
 *
 * Every fork stylesheet reaches into upstream by name: a CSS variable, a
 * `data-slot`, a data attribute, a utility class. None of those names is a
 * typed contract, so an upstream sync can rename one and nothing fails to
 * compile — the fork rule simply stops matching, or worse, a `var()` that no
 * longer resolves invalidates the whole declaration around it. That is how
 * the timeline cutoff vanished when upstream renamed
 * `--topbar-scroll-fade-height` (#8799): the fork read the old name, the
 * mask-size declaration went invalid at computed-value time, and the guard
 * for it stayed green because it pinned the fork's own text.
 *
 * This guard resolves every name the fork stylesheets reference against the
 * web app's own source: a variable must be declared in some stylesheet or
 * stamped from TypeScript, and a selector's attribute, value or class must
 * appear in some component. It asks nothing about what the names mean —
 * only that they still exist — which is exactly the check a rename defeats.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const webSrc = NodeURL.fileURLToPath(new URL("..", import.meta.url));
const webRoot = NodePath.join(webSrc, "..");

/** Fork-owned stylesheets: the themed overlay, the palettes, and custom/**. */
const FORK_STYLESHEETS = [
  "theme.custom.css",
  "theme.custom.palettes.css",
  ...walk(NodePath.join(webSrc, "custom"))
    .filter((file) => file.endsWith(".css"))
    .map((file) => NodePath.relative(webSrc, file)),
];

/**
 * Names that exist only at runtime. Base UI stamps positioner geometry on
 * the popup as inline custom properties, so no source file declares them.
 * Add here only with a comment saying who sets the value.
 */
const RUNTIME_VARIABLES = new Set<string>([
  // Base UI Popup/Positioner inline styles.
  "--anchor-width",
  "--anchor-height",
  "--available-width",
  "--available-height",
  "--transform-origin",
]);

/** Attributes a library stamps on the DOM at runtime, never in our JSX. */
const RUNTIME_ATTRIBUTES = new Set<string>([
  // Base UI Tooltip.Trigger marks its rendered element.
  "data-base-ui-tooltip-trigger",
]);

function walk(directory: string): string[] {
  const out: string[] = [];
  for (const entry of NodeFS.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function read(relativeToSrc: string): string {
  return NodeFS.readFileSync(NodePath.join(webSrc, relativeToSrc), "utf8");
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//gu, " ");
}

/** Block comments and whole-line `//` comments; string contents are kept. */
function stripComments(source: string): string {
  return stripCssComments(source).replace(/^\s*\/\/.*$/gmu, "");
}

/**
 * Everything under apps/web/src plus index.html, concatenated once. Tests
 * (these guards included) are left out and comments are stripped: a name
 * that survives only in a test assertion or a code comment is exactly the
 * stale reference this guard exists to catch, and quoting the old name in a
 * comment must not count as declaring it.
 */
const sourceCorpus = (() => {
  const files = walk(webSrc).filter(
    (file) =>
      /\.(?:tsx?|css|html)$/u.test(file) &&
      !/\.test\.[cm]?tsx?$/u.test(file) &&
      !file.includes(`${NodePath.sep}__fork_guards__${NodePath.sep}`),
  );
  files.push(NodePath.join(webRoot, "index.html"));
  return files.map((file) => stripComments(NodeFS.readFileSync(file, "utf8"))).join("\n");
})();

/**
 * Stylesheets only (upstream and fork), comments stripped, for declarations.
 * Tailwind's default theme is included because `--color-*` variables the
 * fork reads (`var(--color-emerald-600)`) are declared there, not in src.
 */
const declarationCorpus = [
  ...walk(webSrc).filter((file) => file.endsWith(".css")),
  NodePath.join(webRoot, "node_modules/tailwindcss/theme.css"),
]
  .filter((file) => NodeFS.existsSync(file))
  .map((file) => stripCssComments(NodeFS.readFileSync(file, "utf8")))
  .join("\n");

const forkCss = new Map(
  FORK_STYLESHEETS.map((file) => [file, stripCssComments(read(file))] as const),
);

/** `where` is the fork file the reference lives in, for the failure message. */
interface Reference {
  readonly name: string;
  readonly where: string;
}

function collect(pattern: RegExp, pick: (match: RegExpExecArray) => string | null): Reference[] {
  const seen = new Map<string, Reference>();
  for (const [where, css] of forkCss) {
    for (const match of css.matchAll(pattern)) {
      const name = pick(match as RegExpExecArray);
      if (name && !seen.has(name)) seen.set(name, { name, where });
    }
  }
  return [...seen.values()];
}

function variableIsDeclared(name: string): boolean {
  if (RUNTIME_VARIABLES.has(name)) return true;
  // A stylesheet declaration; a Tailwind arbitrary property in a className
  // (`[--chat-composer-attachment-overlap:calc(1rem+1px)]`); or a TypeScript
  // stamp such as `style={{ "--fork-composer-inset": ... }}`.
  const declared = new RegExp(`${escape(name)}\\s*:`, "u");
  return (
    declared.test(declarationCorpus) ||
    declared.test(sourceCorpus) ||
    new RegExp(`["'\`]${escape(name)}["'\`]`, "u").test(sourceCorpus)
  );
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
}

describe("fork guard: fork-upstream-names", () => {
  it("reads at least the two themed stylesheets and the custom styles", () => {
    expect(FORK_STYLESHEETS).toContain("theme.custom.css");
    expect(FORK_STYLESHEETS).toContain("theme.custom.palettes.css");
    expect(FORK_STYLESHEETS.some((file) => file.startsWith("custom/"))).toBe(true);
  });

  it("references only CSS variables that something declares", () => {
    // `var(--name` with or without a fallback. A fallback does not excuse an
    // unresolved name: the fade rule had none, and a fallback that silently
    // takes over on a rename is a different bug, not a fix.
    const references = collect(/var\(\s*(--[\w-]+)/gu, (match) => match[1] ?? null);
    expect(references.length).toBeGreaterThan(20);
    const missing = references.filter((reference) => !variableIsDeclared(reference.name));
    expect(
      missing.map((reference) => `${reference.name} (${reference.where})`),
      "fork stylesheets read CSS variables nothing declares — upstream renamed them?",
    ).toEqual([]);
  });

  it("selects only data attributes and slot values that some component stamps", () => {
    // `[data-foo="bar"]`, `[data-foo]`, and `[data-foo*="bar"]` style matches.
    const references = collect(/\[(data-[\w-]+)(?:\s*[~|^$*]?=\s*"([^"]*)")?\]/gu, (match) =>
      match[2] === undefined ? (match[1] ?? null) : `${match[1]}="${match[2]}"`,
    );
    expect(references.length).toBeGreaterThan(20);
    const missing = references.filter((reference) => {
      const [attribute, value] = reference.name.split("=") as [string, string | undefined];
      if (RUNTIME_ATTRIBUTES.has(attribute)) return false;
      // The attribute name must appear somewhere in source: JSX (`data-x=` or
      // a bare boolean `data-x>`), a string constant, or a setAttribute call.
      if (!new RegExp(`${escape(attribute)}(?![\\w-])`, "u").test(sourceCorpus)) {
        return true;
      }
      if (value === undefined) return false;
      // The value must appear as a string literal somewhere too. Lenient by
      // design — "true" matches anything — because values are often composed
      // from constants; a rename of the attribute is the realistic drift.
      const literal = value.replace(/^"|"$/gu, "");
      return !new RegExp(`["'\`]${escape(literal)}["'\`]`, "u").test(sourceCorpus);
    });
    expect(
      missing.map((reference) => `[${reference.name}] (${reference.where})`),
      "fork stylesheets select data attributes nothing stamps — upstream renamed them?",
    ).toEqual([]);
  });

  it("selects only class names that some component or utility carries", () => {
    // Class selectors, with Tailwind's escaping undone (`.hover\:bg-accent\/20`
    // is the utility string `hover:bg-accent/20` in a className).
    const references = collect(
      /(?<![\w-])\.((?:[\w-]|\\.)+)/gu,
      (match) => match[1]?.replace(/\\(.)/gu, "$1") ?? null,
    ).filter((reference) => !/^\d/u.test(reference.name));
    expect(references.length).toBeGreaterThan(5);
    const missing = references.filter((reference) => {
      const name = escape(reference.name);
      // In a className string, a @utility definition, or a classList call.
      return !(
        new RegExp(`(?:^|["'\`\\s])${name}(?:$|["'\`\\s])`, "mu").test(sourceCorpus) ||
        new RegExp(`@utility\\s+${name}\\b`, "u").test(declarationCorpus)
      );
    });
    expect(
      missing.map((reference) => `.${reference.name} (${reference.where})`),
      "fork stylesheets select classes nothing renders — upstream renamed them?",
    ).toEqual([]);
  });
});
