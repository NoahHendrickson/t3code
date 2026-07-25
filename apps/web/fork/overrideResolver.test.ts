// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { resolveForkOverride, SHADOW_DIR, toSrcRelativePath } from "./overrideResolver";

const SRC = NodePath.resolve("/repo/apps/web/src");
const OVERRIDES = NodePath.join(SRC, "overrides");

const inSrc = (path: string) => NodePath.join(SRC, path);
const inOverrides = (path: string) => NodePath.join(OVERRIDES, path);

function withFiles(...files: Array<string>) {
  const present = new Set(files.map((file) => NodePath.resolve(file)));
  return {
    srcDir: SRC,
    overridesDir: OVERRIDES,
    fileExists: (path: string) => present.has(NodePath.resolve(path)),
  };
}

describe("toSrcRelativePath", () => {
  it("maps a tilde alias onto its src-relative path", () => {
    expect(toSrcRelativePath("~/components/ui/button", undefined, SRC)).toBe(
      "components/ui/button",
    );
  });

  it("maps a relative import against its importer", () => {
    expect(toSrcRelativePath("../ui/button", inSrc("components/chat/ChatComposer.tsx"), SRC)).toBe(
      "components/ui/button",
    );
  });

  it("ignores bare package specifiers", () => {
    expect(toSrcRelativePath("lucide-react", inSrc("components/ChatView.tsx"), SRC)).toBeNull();
  });

  it("ignores relative imports that escape src", () => {
    expect(toSrcRelativePath("../../package.json", inSrc("main.tsx"), SRC)).toBeNull();
  });

  it("ignores relative imports with no importer", () => {
    expect(toSrcRelativePath("./main", undefined, SRC)).toBeNull();
  });
});

describe("resolveForkOverride", () => {
  const shadowed = withFiles(
    inSrc("components/ui/button.tsx"),
    inOverrides("components/ui/button.tsx"),
  );

  it("redirects a tilde import to the shadow file", () => {
    expect(resolveForkOverride("~/components/ui/button", inSrc("AppRoot.tsx"), shadowed)).toBe(
      inOverrides("components/ui/button.tsx"),
    );
  });

  // The case that carries the weight: `apps/web/src` has ~1450 relative
  // imports against ~394 tilde imports, so an alias-only resolver would miss
  // most of the app.
  it("redirects a relative import to the shadow file", () => {
    expect(
      resolveForkOverride("../ui/button", inSrc("components/chat/ChatComposer.tsx"), shadowed),
    ).toBe(inOverrides("components/ui/button.tsx"));
  });

  it("resolves a tilde import with no shadow to the upstream module", () => {
    // Answered here rather than deferred, so resolution does not depend on
    // tsconfig `paths` array-fallback ordering.
    expect(
      resolveForkOverride("~/lib/utils", inSrc("AppRoot.tsx"), withFiles(inSrc("lib/utils.ts"))),
    ).toBe(inSrc("lib/utils.ts"));
  });

  it("leaves an unshadowed relative import to Vite", () => {
    expect(
      resolveForkOverride(
        "../ui/button",
        inSrc("components/chat/ChatComposer.tsx"),
        withFiles(inSrc("components/ui/button.tsx")),
      ),
    ).toBeNull();
  });

  it("leaves bare package specifiers alone", () => {
    expect(
      resolveForkOverride(
        "lucide-react",
        inSrc("AppRoot.tsx"),
        withFiles(inOverrides("components/ui/button.tsx")),
      ),
    ).toBeNull();
  });

  it("resolves a directory shadow through its index file", () => {
    expect(
      resolveForkOverride(
        "~/components/chat",
        inSrc("AppRoot.tsx"),
        withFiles(inOverrides("components/chat/index.tsx")),
      ),
    ).toBe(inOverrides("components/chat/index.tsx"));
  });

  it("preserves Vite's query suffixes", () => {
    expect(
      resolveForkOverride(
        "~/assets/logo.css?inline",
        inSrc("AppRoot.tsx"),
        withFiles(inOverrides("assets/logo.css")),
      ),
    ).toBe(`${inOverrides("assets/logo.css")}?inline`);
  });

  it("resolves an exact extension when the shadow matches it", () => {
    expect(resolveForkOverride("~/components/ui/button.tsx", inSrc("AppRoot.tsx"), shadowed)).toBe(
      inOverrides("components/ui/button.tsx"),
    );
  });

  /**
   * The shadow tree is a transparent overlay: an upstream file copied into it
   * must keep working with its imports unmodified. Rewriting every relative
   * import on copy would be a per-file tax and would leave the shadow diffed
   * against upstream on lines that have nothing to do with the customization,
   * making later ports of upstream changes harder than they need to be.
   */
  describe("overlay semantics for copied overrides", () => {
    const importer = inOverrides("components/chat/ChatComposer.tsx");

    it("falls back to upstream for a relative import with no shadow", () => {
      expect(
        resolveForkOverride("../ui/button", importer, withFiles(inSrc("components/ui/button.tsx"))),
      ).toBe(inSrc("components/ui/button.tsx"));
    });

    it("prefers a sibling shadow when one exists", () => {
      expect(resolveForkOverride("../ui/button", importer, shadowed)).toBe(
        inOverrides("components/ui/button.tsx"),
      );
    });

    it("falls back to upstream for a tilde import with no shadow", () => {
      expect(resolveForkOverride("~/lib/utils", importer, withFiles(inSrc("lib/utils.ts")))).toBe(
        inSrc("lib/utils.ts"),
      );
    });

    it("resolves a helper co-located in the shadow tree", () => {
      expect(
        resolveForkOverride(
          "./helper",
          importer,
          withFiles(inOverrides("components/chat/helper.ts")),
        ),
      ).toBe(inOverrides("components/chat/helper.ts"));
    });

    it("returns null when the module exists nowhere", () => {
      expect(resolveForkOverride("./nope", importer, withFiles())).toBeNull();
    });
  });

  describe("recursion safety", () => {
    // Without this a wrapper override resolves to itself and the dev server
    // stack-overflows. tsconfig `paths` maps `~/*` override-first as well, so
    // deferring to normal resolution is not safe here.
    it("resolves an override's tilde self-import to the upstream module", () => {
      expect(
        resolveForkOverride(
          "~/components/ui/button",
          inOverrides("components/ui/button.tsx"),
          shadowed,
        ),
      ).toBe(inSrc("components/ui/button.tsx"));
    });

    it("resolves an override's relative self-import to the upstream module", () => {
      expect(
        resolveForkOverride("./button", inOverrides("components/ui/button.tsx"), shadowed),
      ).toBe(inSrc("components/ui/button.tsx"));
    });

    it("resolves the ~upstream escape hatch to the upstream module", () => {
      expect(
        resolveForkOverride(
          "~upstream/components/ui/button",
          inOverrides("components/ui/button.tsx"),
          shadowed,
        ),
      ).toBe(inSrc("components/ui/button.tsx"));
    });

    it("returns null when ~upstream names no module", () => {
      expect(
        resolveForkOverride("~upstream/nope/missing", inSrc("AppRoot.tsx"), shadowed),
      ).toBeNull();
    });
  });
});

/**
 * A shadow file at a path matching no upstream module is dead code: it loads
 * for nobody and fails silently. One typo (`ChatComposr.tsx`) and the
 * customization simply never appears, with no error anywhere. This is the
 * guard that makes that loud. Brand-new components belong in `src/custom/`,
 * which carries no shadow semantics.
 */
describe("shadow tree integrity", () => {
  const realSrc = NodePath.resolve(NodeURL.fileURLToPath(new URL("../src", import.meta.url)));
  const realOverrides = NodePath.join(realSrc, SHADOW_DIR);

  function walk(directory: string): Array<string> {
    if (!NodeFS.existsSync(directory)) {
      return [];
    }
    return NodeFS.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = NodePath.join(directory, entry.name);
      return entry.isDirectory()
        ? walk(entryPath)
        : /\.(tsx|ts|jsx|js|mjs|css)$/.test(entry.name)
          ? [entryPath]
          : [];
    });
  }

  it("every override shadows a module that exists upstream", () => {
    const orphans = walk(realOverrides)
      .filter((file) => !/\.test\.(tsx|ts)$/.test(file))
      .filter((file) => {
        const relative = NodePath.relative(realOverrides, file);
        const upstream = NodePath.join(realSrc, relative);
        const withoutExtension = upstream.slice(0, -NodePath.extname(upstream).length);
        // Tolerate a shadow written with a different but equivalent extension.
        return ![".tsx", ".ts", ".jsx", ".js", ".mjs", ".css"].some((extension) =>
          NodeFS.existsSync(withoutExtension + extension),
        );
      })
      .map((file) => NodePath.relative(realOverrides, file));

    expect(orphans, "override files that shadow nothing upstream").toEqual([]);
  });
});
