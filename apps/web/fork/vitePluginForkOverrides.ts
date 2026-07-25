// @effect-diagnostics nodeBuiltinImport:off
/**
 * Vite plugin wiring for the fork override tree — see `.fork/README.md` §3.
 *
 * Thin shell around `resolveForkOverride`; all resolution rules live there so
 * they can be unit-tested without a Vite server.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { resolveForkOverride } from "./overrideResolver";

export interface ForkOverridesOptions {
  /** Absolute path to `apps/web/src`. */
  readonly srcDir: string;
}

export function forkOverrides(options: ForkOverridesOptions) {
  const srcDir = NodePath.resolve(options.srcDir);
  const overridesDir = NodePath.join(srcDir, "overrides");

  // Resolution runs on every import in a large module graph, so cache the
  // stat calls. Dev invalidates the cache when the shadow tree changes.
  let existsCache = new Map<string, boolean>();
  const fileExists = (path: string): boolean => {
    const cached = existsCache.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const exists = NodeFS.existsSync(path) && NodeFS.statSync(path).isFile();
    existsCache.set(path, exists);
    return exists;
  };

  return {
    name: "fork:overrides",
    // Must beat `resolve.tsconfigPaths`, which would otherwise claim `~/*`.
    enforce: "pre" as const,

    resolveId(source: string, importer: string | undefined) {
      return resolveForkOverride(source, importer, { srcDir, overridesDir, fileExists });
    },

    configureServer(server: {
      watcher: {
        add: (path: string) => void;
        on: (event: string, listener: (path: string) => void) => void;
      };
      restart: () => void;
    }) {
      // Adding or deleting a shadow file changes how *other* modules resolve,
      // and those resolutions are already baked into the module graph. A
      // restart is the honest response; edits to an existing shadow file still
      // hot-reload normally.
      server.watcher.add(overridesDir);
      const onShadowTreeChange = (path: string): void => {
        if (!NodePath.resolve(path).startsWith(overridesDir)) {
          return;
        }
        existsCache = new Map();
        void server.restart();
      };
      server.watcher.on("add", onShadowTreeChange);
      server.watcher.on("unlink", onShadowTreeChange);
    },
  };
}
