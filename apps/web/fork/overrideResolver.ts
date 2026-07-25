/**
 * Fork override resolution — see `.fork/README.md` §3 (Tier 2).
 *
 * Lets this fork replace an upstream module by dropping a file at the mirrored
 * path under `src/overrides/`, without editing the upstream file or any of its
 * import sites:
 *
 *   src/overrides/components/ui/button.tsx   ← wins over
 *   src/components/ui/button.tsx
 *
 * Both `~/`-aliased and relative imports are redirected. Relative imports are
 * the ones that matter: `apps/web/src` currently has ~1450 relative imports
 * against ~394 `~/` imports, so an alias-only resolver would miss most of the
 * app.
 *
 * This module is pure: all filesystem access goes through `fileExists`, so the
 * resolution rules are unit-testable without a Vite server.
 */

import * as NodePath from "node:path";

export interface OverrideResolverOptions {
  /** Absolute path to `apps/web/src`. */
  readonly srcDir: string;
  /** Absolute path to the shadow tree, normally `apps/web/src/overrides`. */
  readonly overridesDir: string;
  readonly fileExists: (path: string) => boolean;
}

/**
 * Extension search order. `.css` is included so a stylesheet can be shadowed,
 * though prefer an additive stylesheet over shadowing `index.css` wholesale.
 */
const RESOLVABLE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".css"];

/** Always resolves to the upstream module, so an override can wrap what it shadows. */
export const UPSTREAM_PREFIX = "~upstream/";
const ALIAS_PREFIX = "~/";

/** Name of the shadow tree directory, relative to `src`. */
export const SHADOW_DIR = "overrides";

/** Splits `./foo.css?inline` into its path and the `?…`/`#…` suffix Vite appends. */
function splitSuffix(specifier: string): { path: string; suffix: string } {
  const index = specifier.search(/[#?]/);
  return index === -1
    ? { path: specifier, suffix: "" }
    : { path: specifier.slice(0, index), suffix: specifier.slice(index) };
}

function isRelative(specifier: string): boolean {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}

/** Extensionless imports are the norm here, so try extensions then `index.*`. */
function resolveWithExtensions(
  basePath: string,
  fileExists: (path: string) => boolean,
): string | null {
  const extension = NodePath.extname(basePath);
  if (RESOLVABLE_EXTENSIONS.includes(extension)) {
    return fileExists(basePath) ? basePath : null;
  }

  for (const candidateExtension of RESOLVABLE_EXTENSIONS) {
    const candidate = basePath + candidateExtension;
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  for (const candidateExtension of RESOLVABLE_EXTENSIONS) {
    const candidate = NodePath.join(basePath, `index${candidateExtension}`);
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Maps an import specifier onto its path relative to `srcDir`, using forward
 * slashes. Returns null for bare package specifiers and for anything that
 * resolves outside `src`.
 */
export function toSrcRelativePath(
  specifierPath: string,
  importer: string | undefined,
  srcDir: string,
): string | null {
  let absolute: string;

  if (specifierPath.startsWith(ALIAS_PREFIX)) {
    absolute = NodePath.join(srcDir, specifierPath.slice(ALIAS_PREFIX.length));
  } else if (isRelative(specifierPath)) {
    if (importer === undefined) {
      return null;
    }
    absolute = NodePath.resolve(NodePath.dirname(splitSuffix(importer).path), specifierPath);
  } else {
    return null;
  }

  const relative = NodePath.relative(srcDir, absolute);
  if (relative === "" || relative.startsWith("..") || NodePath.isAbsolute(relative)) {
    return null;
  }

  return relative.split(NodePath.sep).join("/");
}

/**
 * Returns the absolute path the specifier should resolve to, or null to leave
 * resolution alone.
 */
export function resolveForkOverride(
  specifier: string,
  importer: string | undefined,
  options: OverrideResolverOptions,
): string | null {
  const { path: specifierPath, suffix } = splitSuffix(specifier);

  if (specifierPath.startsWith(UPSTREAM_PREFIX)) {
    const upstream = resolveWithExtensions(
      NodePath.join(options.srcDir, specifierPath.slice(UPSTREAM_PREFIX.length)),
      options.fileExists,
    );
    return upstream === null ? null : upstream + suffix;
  }

  const srcRelative = toSrcRelativePath(specifierPath, importer, options.srcDir);
  if (srcRelative === null) {
    return null;
  }

  // The shadow tree is a transparent overlay: a path is addressed the same way
  // whether the import came from `src/…` or from `src/overrides/…`. That is
  // what lets an upstream file be copied into the shadow tree and edited
  // without rewriting its relative imports — `../ui/button` inside an override
  // keeps meaning "the button module", picking up a shadow if one exists and
  // upstream otherwise. Keeping the copy import-identical to upstream also
  // keeps future ports of upstream changes into the shadow a clean 3-way merge.
  const fromShadowTree = srcRelative === SHADOW_DIR || srcRelative.startsWith(`${SHADOW_DIR}/`);
  const logicalPath = fromShadowTree ? srcRelative.slice(SHADOW_DIR.length + 1) : srcRelative;
  if (logicalPath === "") {
    return null;
  }

  const override = resolveWithExtensions(
    NodePath.join(options.overridesDir, logicalPath),
    options.fileExists,
  );

  // An override importing the module it shadows means "the upstream one",
  // otherwise the file resolves to itself and recurses.
  const isSelfImport =
    importer !== undefined &&
    override !== null &&
    override === NodePath.resolve(splitSuffix(importer).path);

  if (override !== null && !isSelfImport) {
    return override + suffix;
  }

  // Fall back to upstream explicitly rather than returning null, in the cases
  // where normal resolution is not a safe fallback:
  //   - a self-import would be re-claimed by the tsconfig `paths`
  //     override-first mapping and recurse;
  //   - a shadow-tree-relative specifier would be looked up inside the shadow
  //     tree, where the module usually does not exist;
  //   - an aliased specifier would depend on `paths` array-fallback ordering,
  //     so answer it here and keep resolution identical either way.
  // Plain relative imports in upstream files still fall through to Vite.
  if (isSelfImport || fromShadowTree || specifierPath.startsWith(ALIAS_PREFIX)) {
    const upstream = resolveWithExtensions(
      NodePath.join(options.srcDir, logicalPath),
      options.fileExists,
    );
    return upstream === null ? null : upstream + suffix;
  }

  return null;
}
