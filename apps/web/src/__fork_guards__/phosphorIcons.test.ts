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
import { describe, expect, it } from "vite-plus/test";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");
const SHIM_PATH = "src/custom/icons/lucide-phosphor.tsx";

function read(relativePath: string): string {
  return NodeFS.readFileSync(NodePath.join(webRoot, relativePath), "utf8");
}

function sourceFiles(dir: string): string[] {
  return NodeFS.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Named bindings pulled from "lucide-react" anywhere under `apps/web/src`. */
function importedLucideNames(): string[] {
  const names = new Set<string>();
  for (const file of sourceFiles(NodePath.join(webRoot, "src"))) {
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
  });
});
