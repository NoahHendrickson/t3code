// @effect-diagnostics nodeBuiltinImport:off
// Fork-only Vite plugin — see `.fork/customizations.yaml#fork-design-mode`.
//
// Exposes `virtual:fork-design-mode-engine`, whose default export is the design-mode
// engine (src/custom/designMode/engine/) bundled by esbuild into one self-contained,
// minified IIFE string. The host injects that string into the preview webview's guest
// page via `webview.executeJavaScript` — the guest is cross-origin and shares nothing
// with the app bundle, so the engine must arrive as a single serialized script, not as
// modules. Import sites load the virtual module lazily (dynamic import), so the ~180KB
// string lands in its own chunk and costs nothing until Design mode is first toggled.
import { build } from "esbuild";
import * as NodePath from "node:path";
import type { Plugin } from "vite";

export const FORK_DESIGN_MODE_VIRTUAL_ID = "virtual:fork-design-mode-engine";
const RESOLVED_ID = `\0${FORK_DESIGN_MODE_VIRTUAL_ID}`;

export interface ForkDesignModeOptions {
  /** Absolute path to the engine entry (src/custom/designMode/engine/boot.ts). */
  readonly entry: string;
}

export function forkDesignModeEngine(options: ForkDesignModeOptions): Plugin {
  let watchedInputs: ReadonlySet<string> = new Set();
  return {
    name: "fork:design-mode-engine",
    resolveId(id) {
      return id === FORK_DESIGN_MODE_VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const result = await build({
        entryPoints: [options.entry],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "es2022",
        minify: true,
        write: false,
        metafile: true,
        logLevel: "silent",
      });
      const code = result.outputFiles[0]?.text;
      if (code === undefined) {
        throw new Error("fork:design-mode-engine produced no output");
      }
      // Register every bundled source as a watch dependency so an engine edit
      // invalidates the virtual module in dev and triggers rebuilds in watch builds.
      const inputs = Object.keys(result.metafile.inputs).map((input) => NodePath.resolve(input));
      watchedInputs = new Set(inputs);
      for (const input of inputs) this.addWatchFile(input);
      return `export default ${JSON.stringify(code)};\n`;
    },
    handleHotUpdate(ctx) {
      if (!watchedInputs.has(ctx.file)) return undefined;
      const mod = ctx.server.moduleGraph.getModuleById(RESOLVED_ID);
      if (!mod) return undefined;
      ctx.server.moduleGraph.invalidateModule(mod);
      return [...ctx.modules, mod];
    },
  };
}
