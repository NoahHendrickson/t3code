import "vite-plus/test/config";
import { defaultInclude, defineConfig } from "vite-plus";

import { isDesktopRuntimeExternalDependency } from "../../scripts/lib/desktop-external-packages.ts";
import { loadRepoEnv } from "../../scripts/lib/public-config.ts";
// fork:begin fork-brand-name — see .fork/customizations.yaml#fork-brand-name
import { forkBrandName } from "../../scripts/lib/fork-brand-name.ts";
// fork:end fork-brand-name

const repoEnv = loadRepoEnv();

// Install only bundle externals; the server bundle already carries its dependency tree.
const isMainProcessExternal = (id: string) =>
  id === "electron" || id.startsWith("electron/") || isDesktopRuntimeExternalDependency(id);
const shouldLaunchElectronAfterPack = process.env.T3CODE_DESKTOP_DEV === "1";
// fork:begin fork-brand-name — see .fork/customizations.yaml#fork-brand-name
// The legacy profile names and the dictation vocabulary are identities, not display copy.
const forkBrandNamePlugins = [
  forkBrandName({
    exclude: [
      /\/apps\/desktop\/src\/app\/DesktopUserData\.ts$/u,
      /\/apps\/desktop\/src\/fork\/voice\/LocalSpeechEngine\.ts$/u,
    ],
  }),
];
// fork:end fork-brand-name
const publicConfigDefine = {
  __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__: JSON.stringify(
    repoEnv.T3CODE_CLERK_PUBLISHABLE_KEY?.trim() ?? "",
  ),
};

export default defineConfig({
  run: {
    tasks: {
      build: {
        // fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation
        // Literal strings on purpose: knip reads these to find script entries.
        // `--optional` skips the whisper.cpp helper when CMake is missing; only
        // the packaged artifact (scripts/build-desktop-artifact.ts) requires it.
        command:
          "node scripts/build-voice-input.mjs --optional && node scripts/build-browser-secret.mjs && node scripts/build-preview-annotation-css.mjs && vp pack",
        // fork:end fork-local-dictation
        dependsOn: ["t3#build"],
        cache: false,
      },
      dev: {
        // fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation
        command:
          "node scripts/build-voice-input.mjs --optional && node scripts/build-browser-secret.mjs && node scripts/build-preview-annotation-css.mjs && cross-env T3CODE_DESKTOP_DEV=1 vp pack --watch",
        // fork:end fork-local-dictation
        dependsOn: ["t3#build"],
        cache: false,
      },
      "dev:bundle": {
        // fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation
        command:
          "node scripts/build-voice-input.mjs --optional && node scripts/build-browser-secret.mjs && node scripts/build-preview-annotation-css.mjs && vp pack --watch",
        // fork:end fork-local-dictation
        cache: false,
      },
      "dev:electron": {
        command: "node scripts/dev-electron.mjs",
        dependsOn: ["t3#build"],
        cache: false,
      },
      // tsc (tsc-rs) rewrites the tsbuildinfo it reads, which keeps a task out of the cache.
      typecheck: {
        command: "tsc --noEmit",
        cache: { input: [{ auto: true }, "!*.tsbuildinfo"] },
      },
    },
  },
  pack: [
    {
      format: "cjs",
      outDir: "dist-electron",
      dts: false,
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      define: publicConfigDefine,
      outputOptions: { codeSplitting: false },
      entry: ["src/main.ts"],
      // fork:begin fork-brand-name — see .fork/customizations.yaml#fork-brand-name
      plugins: forkBrandNamePlugins,
      // fork:end fork-brand-name
      clean: true,
      deps: {
        alwaysBundle: (id) => !id.startsWith("node:") && !isMainProcessExternal(id),
        neverBundle: isMainProcessExternal,
        onlyBundle: false,
      },
      ...(shouldLaunchElectronAfterPack ? { onSuccess: "node scripts/dev-electron.mjs" } : {}),
    },
    {
      format: "cjs",
      outDir: "dist-electron",
      dts: false,
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      define: publicConfigDefine,
      entry: [
        "src/electron/WindowsForegroundFocusWorker.ts",
        "src/snapShot/GlobalShiftShortcutWorker.ts",
        "src/snapShot/RegionSnapShotWorker.ts",
        "src/snapShot/SnapShotAccessibilityWorker.ts",
      ],
      // fork:begin fork-brand-name — see .fork/customizations.yaml#fork-brand-name
      plugins: forkBrandNamePlugins,
      // fork:end fork-brand-name
      clean: false,
      deps: {
        alwaysBundle: (id) => !id.startsWith("node:") && !isMainProcessExternal(id),
        neverBundle: isMainProcessExternal,
        onlyBundle: false,
      },
    },
    {
      // boot.cjs requires the other two at runtime, so all three stay separate files.
      format: "cjs",
      outDir: "dist-electron",
      dts: false,
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      entry: ["src/boot.ts", "src/compileCache.ts"],
      clean: false,
      deps: {
        neverBundle: (id) => id === "./main.cjs" || id === "./compileCache.cjs",
      },
    },
    {
      format: "cjs",
      outDir: "dist-electron",
      dts: false,
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      define: publicConfigDefine,
      entry: ["src/preload.ts"],
      deps: {
        // Sandboxed preloads cannot resolve imports inside ASAR; bundle Clerk's bridge.
        alwaysBundle: (id) => id === "@clerk/electron" || id.startsWith("@clerk/electron/"),
      },
    },
    {
      format: "cjs",
      outDir: "dist-electron",
      dts: false,
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      entry: ["src/preview-pick-preload.ts"],
      deps: {
        // Sandboxed preload (`sandbox=true`): its `require` cannot resolve npm or
        // `@t3tools/*` packages from the ASAR, so anything left external throws and
        // takes the preview-pick path down. DesignSourceResolver imports `bippy`
        // directly; DesignSourceResult pulls in the shared design-props policy.
        alwaysBundle: (id) =>
          id === "react-grab" ||
          id.startsWith("react-grab/") ||
          id === "bippy" ||
          id.startsWith("bippy/") ||
          id.startsWith("@t3tools/"),
      },
    },
    {
      format: "cjs",
      outDir: "dist-electron",
      dts: false,
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      entry: ["src/preview-pip-preload.ts"],
    },
    {
      // Sandboxed preloads must be self-contained, without shared runtime chunks.
      format: "cjs",
      outDir: "dist-electron",
      dts: false,
      sourcemap: true,
      outExtensions: () => ({ js: ".cjs" }),
      entry: ["src/mac-permission-preload.ts"],
    },
  ],
  test: {
    include: [...defaultInclude, "../../native/kde-snap-shot/src/*.test.ts"],
    // The Windows lane runs workspace suites concurrently; filesystem-heavy
    // desktop integration tests can exceed Vitest's 5 second default there.
    testTimeout: 15_000,
    setupFiles: [
      "../../packages/shared/src/testing/longTempDir.ts",
      "../../packages/shared/src/testing/providerEnv.ts",
    ],
  },
});
