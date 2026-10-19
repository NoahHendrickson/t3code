// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-touch-affordances`.
 *
 * Phone fixes for controls that only a mouse could reach. Each hangs off an
 * upstream hook — a data attribute, a class, a menu handler — that a sync can
 * rename without failing anything else, after which the control silently
 * goes back to being hover-only, or invisible but tappable.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { TOUCH_CONTEXT_MENU_SELECTOR } from "../custom/touchLongPressContextMenu";
import { SIDEBAR_V2_SLIM_ROW_ACTION_CLASS } from "../custom/sidebarV2TrailingColumn";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const NO_HOVER = "[@media(any-hover:none)]:";
const theme = readSibling("../theme.custom.css");
const coarseRules = cssRules(theme).filter((rule) =>
  rule.atRules.some((at) => at.includes("(pointer: coarse)")),
);

describe("fork guard: fork-touch-affordances", () => {
  it("installs the iOS long-press at startup", () => {
    expect(readSibling("../main.tsx")).toMatch(/^installTouchLongPressContextMenu\(\);$/mu);
  });

  it("opts in only surfaces that still carry their hook and a context menu", () => {
    const sources: ReadonlyArray<readonly [string, string, string]> = [
      ["[data-thread-item]", "../components/Sidebar.tsx", "data-thread-item"],
      [
        "[data-right-panel-tab-list] [data-active-tab]",
        "../components/RightPanelTabs.tsx",
        "data-active-tab={active}",
      ],
      [".group\\/pr-row", "../components/pullRequest/PullRequestListRow.tsx", "group/pr-row"],
    ];
    expect(TOUCH_CONTEXT_MENU_SELECTOR.split(", ")).toHaveLength(sources.length);
    for (const [selector, file, hook] of sources) {
      expect(TOUCH_CONTEXT_MENU_SELECTOR).toContain(selector);
      expect(readSibling(file)).toContain(hook);
    }
    expect(readSibling("../components/RightPanelTabs.tsx")).toContain("data-right-panel-tab-list");
    // The thread panel's rows wear the list row's class and carry the menu.
    expect(readSibling("../components/pullRequest/ThreadPullRequestsPanel.tsx")).toContain(
      "cn(PULL_REQUEST_ROW_CLASS",
    );
    for (const file of [
      "../components/Sidebar.tsx",
      "../components/RightPanelTabs.tsx",
      "../components/pullRequest/ThreadPullRequestsPanel.tsx",
    ]) {
      expect(readSibling(file)).toContain("onContextMenu=");
    }
  });

  it("keeps a long-press from selecting the same surfaces' text on touch", () => {
    const rule = coarseRules.find((candidate) => candidate.body.includes("-webkit-touch-callout"));
    expect(rule?.selector.startsWith(MARKER)).toBe(true);
    for (const selector of TOUCH_CONTEXT_MENU_SELECTOR.split(", ")) {
      expect(rule?.selector).toContain(selector);
    }
    expect(rule?.body).toContain("user-select: none");
  });

  it("shows a panel tab's X on the active tab and stops inactive icons closing, with no hover", () => {
    const button = readSibling("../components/ui/panel-tab-close-button.tsx");
    expect(button).toContain(`"${NO_HOVER}group-data-[active-tab=false]/tab:pointer-events-none"`);
    expect(button).toContain(`"${NO_HOVER}group-data-[active-tab=true]/tab:hidden"`);
    expect(button).toContain(`"${NO_HOVER}group-data-[active-tab=true]/tab:block"`);
    // Both callers stamp the row the variants read.
    expect(readSibling("../components/RightPanelTabs.tsx")).toMatch(
      /data-active-tab=\{active\}[\s\S]{0,600}?group\/tab/u,
    );
    expect(readSibling("../components/ThreadTerminalDrawer.tsx")).toMatch(
      /data-active-tab=\{isActive\}[\s\S]{0,400}?group\/tab/u,
    );
  });

  it("opens Search through the palette bus, closing the phone sheet first", () => {
    const rows = readSibling("../custom/SidebarV2ChromeRows.tsx");
    expect(rows).toMatch(
      /data-testid="command-palette-trigger"[\s\S]{0,200}?if \(isMobile\) setOpenMobile\(false\);\s*openCommandPalette\(\);/u,
    );
  });

  it("stops invisible controls taking taps, and shows the ones touch needs", () => {
    expect(SIDEBAR_V2_SLIM_ROW_ACTION_CLASS).toContain(`${NO_HOVER}pointer-events-none`);
    expect(readSibling("../overrides/components/chat/ModelPickerContent.tsx")).toMatch(
      /HOVER_REVEAL_CLASS,\s*(?:\/\/[^\n]*\n\s*)*"pointer-coarse:opacity-100"/u,
    );
    const scripts = readSibling("../components/ProjectScriptsControl.tsx");
    expect(scripts).toContain('"pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto"');
    expect(scripts).toContain("group-focus-visible:opacity-0 pointer-coarse:hidden");
  });

  it("sends from the collapsed phone composer with the open composer's button", () => {
    const composer = readSibling("../components/chat/ChatComposer.tsx");
    expect(composer).toMatch(
      /data-chat-composer-transition-actions="true"[\s\S]{0,400}?data-fork-composer-action="send"\s*data-fork-composer-send-tone="flat"/u,
    );
    expect(composer).toMatch(
      /data-chat-composer-transition-actions[\s\S]{0,2000}?<ForkReturnGlyph \/>/u,
    );
    expect(readSibling("../components/chat/ComposerPrimaryActions.tsx")).toContain(
      "<ForkReturnGlyph />",
    );
    const hitArea = coarseRules.find((rule) =>
      rule.selector.endsWith(
        "[data-chat-composer-transition-actions][data-fork-composer-action]::after",
      ),
    );
    expect(hitArea?.body).toContain("inset: -4px");
  });
});
