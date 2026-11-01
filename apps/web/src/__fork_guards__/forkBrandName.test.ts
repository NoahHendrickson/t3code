// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-brand-name`.
 *
 * The fork's name reaches upstream's inline "T3 Code" copy through one
 * build-time rewrite, so a sync that drops the plugin wiring silently brings
 * upstream's name back everywhere at once.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  EXCLUDED_MODULES,
  FORK_DISPLAY_NAME,
  PRESERVED_PHRASES,
  forkBrandName,
  rewriteUpstreamDisplayName,
} from "../../../../scripts/lib/fork-brand-name.ts";
import { FORK_APP_BASE_NAME } from "../custom/forkBranding";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);
const read = (relativePath: string): string =>
  NodeFS.readFileSync(NodePath.join(repoRoot, relativePath), "utf8");

type TransformHook = (code: string, id: string) => { code: string; map: null } | null;
const transform = forkBrandName().transform as TransformHook;

describe("fork guard: fork-brand-name", () => {
  it("rewrites upstream's display name and keeps every preserved phrase", () => {
    expect(FORK_DISPLAY_NAME).toBe(FORK_APP_BASE_NAME);
    for (const [input, expected] of [
      ["T3 Code failed to start", "no3y Code failed to start"],
      ["Run T3 Code's CLI. Restart T3 Code.", "Run no3y Code's CLI. Restart no3y Code."],
      ["<title>T3 Code (Beta)</title>", "<title>no3y Code (Beta)</title>"],
      ["`${reason}\\n\\nT3 Code will restart`", "`${reason}\\n\\nno3y Code will restart`"],
      ["Sign in to T3 Connect on the T3 server", null],
    ] as const) {
      expect(rewriteUpstreamDisplayName(input)).toBe(expected);
    }
    for (const phrase of PRESERVED_PHRASES) {
      expect(rewriteUpstreamDisplayName(`Before ${phrase} after, T3 Code.`)).toBe(
        `Before ${phrase} after, no3y Code.`,
      );
    }
  });

  it("transforms built scripts only, never dependencies or excluded identities", () => {
    const source = 'const label = "T3 Code";';
    expect(transform(source, "/repo/apps/web/src/a.tsx?v=1")).toEqual({
      code: 'const label = "no3y Code";',
      map: null,
    });
    expect(transform(source, "/repo/node_modules/pkg/index.js")).toBeNull();
    expect(transform(source, "/repo/apps/web/src/index.css")).toBeNull();
    for (const path of [
      "/repo/apps/desktop/src/app/DesktopUserData.ts",
      "/repo/apps/desktop/src/fork/voice/LocalSpeechEngine.ts",
    ]) {
      expect(EXCLUDED_MODULES.some((pattern) => pattern.test(path))).toBe(true);
      expect(transform(source, path)).toBeNull();
    }
  });

  it("wires the rewrite into the web build and both desktop pack entries", () => {
    expect(read("apps/web/vite.config.ts")).toContain("forkBrandName()");
    expect(
      read("apps/desktop/vite.config.ts").match(/plugins: \[forkBrandName\(\)\]/gu),
    ).toHaveLength(2);
  });

  it("names the installable web app and the macOS permission prompts after the fork", () => {
    const manifest = JSON.parse(read("apps/web/public/manifest.webmanifest")) as {
      name: string;
      short_name: string;
    };
    expect(manifest.name).toBe(FORK_APP_BASE_NAME);
    expect(manifest.short_name).toBe(FORK_APP_BASE_NAME);
    const packaging = read("scripts/build-desktop-artifact.ts");
    for (const key of [
      "NSLocalNetworkUsageDescription",
      "NSScreenCaptureUsageDescription",
      "NSCameraUsageDescription",
    ]) {
      expect(packaging).toMatch(new RegExp(`${key}:\\s*"no3y Code `, "u"));
    }
  });

  it("credits upstream in Settings and the desktop About panel", () => {
    expect(read("apps/web/src/components/settings/SettingsPanels.tsx")).toContain(
      "<ForkUpstreamCreditRow />",
    );
    expect(read("apps/web/src/custom/ForkUpstreamCreditRow.tsx")).toContain(
      "https://github.com/pingdotgg/t3code",
    );
    expect(read("apps/desktop/src/app/DesktopAppIdentity.ts")).toContain(
      'credits: "Fork of T3 Code"',
    );
  });
});
