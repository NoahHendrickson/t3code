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
  FORK_DISPLAY_NAME,
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

describe("fork guard: fork-brand-name", () => {
  it("rewrites upstream's display name and keeps the credit and identities", () => {
    expect(FORK_DISPLAY_NAME).toBe(FORK_APP_BASE_NAME);
    for (const [input, expected] of [
      ["T3 Code failed to start", "no3y Code failed to start"],
      ["Run T3 Code's CLI. Restart T3 Code.", "Run no3y Code's CLI. Restart no3y Code."],
      ["<title>T3 Code (Beta)</title>", "<title>no3y Code (Beta)</title>"],
      ["`${reason}\\n\\nT3 Code will restart`", "`${reason}\\n\\nno3y Code will restart`"],
      ["Fork of T3 Code", null],
      ["a fork of T3 Code", null],
      ["into upstream T3 Code's own state directory", null],
      ["Check T3 Code SnapShots in GNOME Extensions", null],
      ["The T3 Code GNOME extension lets you capture", null],
      ["The T3 Code extension is running.", null],
      ['Revoke "T3 Code · …" in its Connections', null],
      ["Sign in to T3 Connect on the T3 server", null],
    ] as const) {
      expect(rewriteUpstreamDisplayName(input)).toBe(expected);
    }
  });

  it("transforms built scripts only, never dependencies or excluded identities", () => {
    const plugin = forkBrandName({ exclude: [/\/DesktopUserData\.ts$/u] });
    const source = 'const label = "T3 Code";';
    expect(plugin.transform(source, "/repo/apps/web/src/a.tsx?v=1")).toEqual({
      code: 'const label = "no3y Code";',
      map: null,
    });
    expect(plugin.transform(source, "/repo/node_modules/pkg/index.js")).toBeNull();
    expect(plugin.transform(source, "/repo/apps/desktop/src/app/DesktopUserData.ts")).toBeNull();
    expect(plugin.transform(source, "/repo/apps/web/src/index.css")).toBeNull();
  });

  it("wires the rewrite into the web and desktop builds", () => {
    expect(read("apps/web/vite.config.ts")).toContain("forkBrandName(),");
    const desktop = read("apps/desktop/vite.config.ts");
    expect(desktop).toMatch(
      /entry: \["src\/main\.ts"\],\s*\/\/[^\n]*\n\s*plugins: forkBrandNamePlugins,/u,
    );
    expect(desktop).toContain("/\\/apps\\/desktop\\/src\\/app\\/DesktopUserData\\.ts$/u");
  });

  it("names the installable web app after the fork", () => {
    const manifest = JSON.parse(read("apps/web/public/manifest.webmanifest")) as {
      name: string;
      short_name: string;
    };
    expect(manifest.name).toBe(FORK_APP_BASE_NAME);
    expect(manifest.short_name).toBe(FORK_APP_BASE_NAME);
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
