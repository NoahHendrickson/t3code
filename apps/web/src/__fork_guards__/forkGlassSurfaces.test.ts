// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-cool-darker-theme`.
 *
 * Glass's surfaces sheet (theme.custom.glass-surfaces.css): the selected
 * rows, the composer's chips and vessel, and the popups they open as panes
 * of one glass. It wins its ties with the palettes sheet on source order, so
 * it must load after it. Several selectors lean on markup the fork does not
 * stamp itself: the row shapes' radius classes, MenuPopup's single list
 * child, and the floating-layer attribute every composer popup carries. If
 * any of those moves, the rule silently stops matching, so this pins them.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { COOL_DARKER_THEME, FORK_THEME_ATTRIBUTE } from "../custom/forkTheme";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules, ruleBodyFor } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const PALETTE = `[${FORK_THEME_ATTRIBUTE}="${COOL_DARKER_THEME}"]`;

const sheet = readSibling("../theme.custom.glass-surfaces.css");
const rules = cssRules(sheet);

describe("fork guard: glass surfaces", () => {
  it("loads after the palettes sheet", () => {
    const main = readSibling("../main.tsx");
    const palettesAt = main.indexOf('import "./theme.custom.palettes.css";');
    const surfacesAt = main.indexOf('import "./theme.custom.glass-surfaces.css";');
    expect(palettesAt).toBeGreaterThan(-1);
    expect(surfacesAt).toBeGreaterThan(palettesAt);
  });

  it("scopes every rule to the fork marker and Glass", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.selector, `unscoped rule "${rule.selector}"`).toContain(MARKER);
      expect(rule.selector, `not scoped to Glass "${rule.selector}"`).toContain(PALETTE);
      // Under the desktop glass a transparent fill is a hole to the raw
      // wallpaper; write a zero-alpha colour where a gradient needs one.
      expect(rule.body, `went transparent: ${rule.selector}`).not.toContain("transparent");
    }
  });

  it("keys the composer popups on the attribute upstream already stamps", () => {
    expect(readSibling("../components/chat/composerEventScope.ts")).toContain(
      '"data-chat-composer-floating-layer": "true"',
    );
    expect(sheet).toContain('[data-chat-composer-floating-layer="true"]');
  });

  it("gives send and stop translucent faces and shared static glass edges", () => {
    const send = '[data-fork-composer-action="send"][data-fork-composer-send-tone="flat"]';
    const stop = '[data-fork-composer-action="stop"]';
    const face = ruleBodyFor(rules, [`${MARKER}.dark${PALETTE}`, send]);
    expect(face).toMatch(/background:\s*rgb\(255 255 255 \/ 10%\)/u);
    expect(face).toMatch(/color:\s*#ffffff/u);

    const stopFace = ruleBodyFor(rules, [`${MARKER}.dark${PALETTE}`, stop]);
    expect(stopFace).toMatch(/background:\s*rgb\(234 49 80 \/ 24%\)/u);
    expect(stopFace).toMatch(/color:\s*#ffffff/u);
    expect(readSibling("../components/chat/ComposerPrimaryActions.tsx")).toContain(
      'data-fork-composer-action="stop"',
    );

    const light = ruleBodyFor(rules, [
      `${MARKER}.dark${PALETTE}`,
      `${send}:not(:disabled),`,
      `${MARKER}.dark${PALETTE}`,
      `${stop}:not(:disabled)`,
    ]);
    expect(light).toContain("inset 2px 2px 2px rgb(248 112 157 / 16%)");
    expect(light).toContain("inset -2px -2px 2px rgb(122 79 249 / 24%)");
    expect(light).toContain("--tw-ring-shadow");
    expect(light).toContain("0 0 2px 1px rgb(0 0 0 / 24%)");

    for (const rule of rules.filter(
      (candidate) => candidate.selector.includes(send) || candidate.selector.includes(stop),
    )) {
      // Phone hit areas and disabled semantics belong to the existing button.
      expect(rule.selector).not.toMatch(/::(?:before|after)/u);
      expect(rule.body).not.toMatch(
        /(?:backdrop-filter|animation|pointer-events|opacity|width|height|border-radius):/u,
      );
      if (/:hover|:active/u.test(rule.selector)) {
        expect(rule.selector).toContain(":not(:disabled)");
      }
    }
  });

  it("reaches the expanded, collapsed-phone and dictation send slots", () => {
    for (const source of [
      "../components/chat/ComposerPrimaryActions.tsx",
      "../components/chat/ChatComposer.tsx",
      "../custom/voice/ForkDictationControl.tsx",
    ]) {
      expect(readSibling(source)).toMatch(
        /data-fork-composer-action="send"\s+data-fork-composer-send-tone="flat"/u,
      );
    }
  });

  it("matches the markup its selectors lean on", () => {
    // The two row shapes Glass rounds further.
    const rowPolicy = readSibling("../custom/sidebarV2RowPolicy.ts");
    expect(rowPolicy).toContain('"rounded-[16px]"');
    expect(rowPolicy).toContain('"rounded-md"');
    expect(sheet).toContain("[data-thread-item] > .rounded-md");
    expect(sheet).toContain("[data-thread-item]\n  > .rounded-\\[16px\\]");
    // The sort menu pads MenuPopup's list, its popup's only child.
    expect(readSibling("../components/ui/menu.tsx")).toMatch(
      /<div className="max-h-\(--available-height\) w-full overflow-y-auto p-1">\{children\}<\/div>\s*<\/MenuPrimitive\.Popup>/u,
    );
    // The stamps the selected states key on.
    expect(readSibling("../custom/SidebarV2ChromeRows.tsx")).toContain("data-fork-chrome-row");
    expect(readSibling("../custom/SidebarV2ChromeRows.tsx")).toContain("data-fork-thread-sort");
  });
});
