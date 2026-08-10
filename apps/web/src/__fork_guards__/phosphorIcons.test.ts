// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#phosphor-duotone-icons`.
 *
 * The icon swap is invisible at every call site: upstream code still imports
 * from "lucide-react", and only the two alias entries redirect that to the
 * Phosphor shim. That is exactly the §4 failure mode — drop either alias in a
 * sync and the app silently renders lucide again, with no conflict and no
 * error. These tests turn that into a red one.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { XIcon } from "~/custom/icons/lucide-phosphor";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");
const repoRoot = NodePath.resolve(webRoot, "../..");
const SHIM_PATH = "src/custom/icons/lucide-phosphor.tsx";

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(webRoot, relativePath), "utf8");
}

function sourceFiles(dir: string): string[] {
  if (!NodeFS.existsSync(dir)) return [];
  return NodeFS.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = NodePath.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Everything the Vite alias applies to. The alias rewrites the whole bundle
    graph, not just `apps/web/src`, so a `lucide-react` import that appears in a
    workspace package is aliased too — and would otherwise go unguarded. */
function aliasedSourceFiles(): string[] {
  return [
    ...sourceFiles(NodePath.join(webRoot, "src")),
    ...sourceFiles(NodePath.join(repoRoot, "packages")),
  ];
}

/** Named bindings pulled from "lucide-react" across the aliased graph. */
function importedLucideNames(): string[] {
  const names = new Set<string>();
  for (const file of aliasedSourceFiles()) {
    const source = NodeFS.readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"lucide-react"/g,
    )) {
      for (const binding of (match[1] ?? "").split(",")) {
        const name = binding
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (name) names.add(name);
      }
    }
  }
  return [...names];
}

describe("fork guard: phosphor-duotone-icons", () => {
  it("keeps the bundler alias pointing lucide-react at the shim", () => {
    const config = read("vite.config.ts");
    expect(config).toContain('"lucide-react": NodeURL.fileURLToPath(');
    expect(config).toContain(SHIM_PATH);
  });

  it("keeps the TypeScript path mapping in step with the bundler alias", () => {
    const tsconfig = read("tsconfig.json");
    expect(tsconfig).toContain(`"lucide-react": ["./${SHIM_PATH}"]`);
  });

  it("exports every lucide binding the app imports", () => {
    const shim = read(SHIM_PATH);
    const exported = new Set([
      ...[...shim.matchAll(/export const (\w+)/g)].map((m) => m[1]),
      ...[...shim.matchAll(/export type (\w+)/g)].map((m) => m[1]),
    ]);
    // A missing name means an upstream sync introduced a lucide icon the shim
    // has no mapping for. Fix: add a line to the table in the shim.
    expect(importedLucideNames().filter((name) => !exported.has(name))).toEqual([]);
  });

  it("renders Phosphor rather than lucide, defaulting to the duotone weight", () => {
    const shim = read(SHIM_PATH);
    expect(shim).toContain('from "@phosphor-icons/react"');
    expect(shim).toContain('"duotone"');
    // The shim must not re-import the package it stands in for — that would
    // alias lucide-react to itself and recurse.
    expect(shim).not.toMatch(/^\s*(?:import|export)\b[^\n]*from "lucide-react"/m);
  });

  it("keeps PR, review-thread, and alias glyphs semantically distinct", () => {
    const shim = read(SHIM_PATH);
    expect(shim).toContain('CircleDotIcon = icon("circle-dot", PhRecord');
    expect(shim).toContain('GitPullRequestClosedIcon = icon("git-pull-request-closed", PhProhibit');
    expect(shim).toContain(
      'GitPullRequestDraftIcon = icon("git-pull-request-draft", PhCircleDashed',
    );
    expect(shim).toContain('ArrowUpRightIcon = icon("arrow-up-right", PhArrowUpRight');
    expect(shim).toContain("MoreHorizontalIcon = EllipsisIcon");
    expect(shim).toContain("XCircleIcon = CircleXIcon");
  });

  it("stamps lucide's class names so upstream icon assertions still pass", () => {
    const shim = read(SHIM_PATH);
    // Upstream identifies icons in tests by these classes (e.g. `lucide-x` in
    // MessagesTimeline.test.tsx). Drop them and those tests fail with a diff
    // that points at upstream code rather than at this shim.
    expect(shim).toContain("`lucide lucide-${lucideName}`");
    // Every entry in the table has to carry a name, or its icon renders
    // unclassed while the rest stay covered.
    expect([...shim.matchAll(/export const \w+ = icon\((.)/g)].filter((m) => m[1] !== '"')).toEqual(
      [],
    );
  });

  it("keeps lucide-react installed only as the alias target's public name", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@phosphor-icons/react"]).toBeTruthy();
    // lucide-react stays a dependency on purpose: it is the name every upstream
    // import site resolves through, and dropping it would break `tsc` for any
    // tool that does not read the fork's path mapping. Nothing renders from it.
    expect(pkg.dependencies?.["lucide-react"]).toBeTruthy();
  });

  it("catches import forms the named-binding scan would miss", () => {
    // The whole point of this guard is catching upstream drift, and a sync can
    // introduce `import Lucide from`, `import * as Lucide from`, or a dynamic
    // `import("lucide-react")` — none of which the `{ … }` scan above sees, so
    // a missing shim export would slip through to runtime.
    const offenders: string[] = [];
    // This file names all three forms in prose, and the shim is the alias
    // target rather than a consumer of it.
    const selfPath = NodeURL.fileURLToPath(import.meta.url);
    for (const file of aliasedSourceFiles()) {
      if (file === selfPath) continue;
      if (file.endsWith(SHIM_PATH.replaceAll("/", NodePath.sep))) continue;
      const source = NodeFS.readFileSync(file, "utf8");
      const hasDefaultOrNamespace =
        /import\s+(?:\*\s+as\s+\w+|\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*"lucide-react"/.test(source);
      const hasDynamic = /import\(\s*"lucide-react"\s*\)/.test(source);
      const hasRequire = /require\(\s*"lucide-react"\s*\)/.test(source);
      if (hasDefaultOrNamespace || hasDynamic || hasRequire) {
        offenders.push(NodePath.relative(repoRoot, file));
      }
    }
    // Fix: convert the import to named bindings, which the shim exports, or add
    // the missing shape to the shim.
    expect(offenders).toEqual([]);
  });

  it("actually renders lucide's class contract, not just declares it", () => {
    // Every other assertion here string-matches the shim's source, so a shim
    // that compiles but renders wrong would pass them all. Render one icon for
    // real and read the class off the SVG.
    const html = renderToStaticMarkup(createElement(XIcon));
    expect(html).toContain("<svg");
    expect(html).toContain("lucide lucide-x");
    // A caller's own className must not displace the contract classes.
    expect(renderToStaticMarkup(createElement(XIcon, { className: "size-4" }))).toContain(
      "lucide lucide-x size-4",
    );
  });
});
