// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-touch-affordances`.
 *
 * Phone fixes for controls that only a mouse could reach. Each hangs off an
 * upstream hook — a data attribute, a class, a dialog the sheet hides — that
 * a sync can rename without failing anything else, after which the control
 * silently goes back to being hover-only, or invisible but tappable.
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
        "[data-fork-project-section-header]",
        "../custom/SidebarV2ProjectGroupHeader.tsx",
        "data-fork-project-section-header",
      ],
      [
        "[data-right-panel-tab-list] [data-active-tab]",
        "../components/RightPanelTabs.tsx",
        "data-active-tab={active}",
      ],
      [".group\\/pr-row", "../components/pullRequest/PullRequestListRow.tsx", "group/pr-row"],
    ];
    for (const [selector, file, hook] of sources) {
      expect(TOUCH_CONTEXT_MENU_SELECTOR).toContain(selector);
      const source = readSibling(file);
      expect(source).toContain(hook);
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

  it("shows the active right-panel tab's X on touch and stops inactive icons closing", () => {
    const inactive = coarseRules.find((rule) =>
      rule.selector.includes('[data-active-tab="false"]'),
    );
    expect(inactive?.selector).toContain("> button:first-child");
    expect(inactive?.body).toContain("pointer-events: none");
    const x = coarseRules.find(
      (rule) =>
        rule.selector.includes('[data-active-tab="true"]') && rule.selector.endsWith("> svg"),
    );
    expect(x?.body).toContain("display: block");
    // The X is the close button's direct svg child, hidden until hover.
    expect(readSibling("../components/ui/panel-tab-close-button.tsx")).toMatch(
      /<X className="hidden [^"]*group-hover\/tab:block/u,
    );
  });

  it("opens Search through the palette bus inside the phone sheet", () => {
    const rows = readSibling("../custom/SidebarV2ChromeRows.tsx");
    expect(rows).toMatch(/if \(isMobile\) \{[\s\S]{0,400}?openCommandPalette\(\);/u);
  });

  it("stops invisible controls taking taps, and shows the ones touch needs", () => {
    expect(SIDEBAR_V2_SLIM_ROW_ACTION_CLASS).toContain("pointer-coarse:pointer-events-none");
    expect(readSibling("../overrides/components/chat/ModelPickerContent.tsx")).toMatch(
      /HOVER_REVEAL_CLASS,\s*(?:\/\/[^\n]*\n\s*)*"pointer-coarse:opacity-100"/u,
    );
    const scripts = readSibling("../components/ProjectScriptsControl.tsx");
    expect(scripts).toContain("pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto");
    expect(scripts).toContain("group-focus-visible:opacity-0 pointer-coarse:hidden");
  });

  it("sends from the collapsed phone composer with the open composer's button", () => {
    const composer = readSibling("../components/chat/ChatComposer.tsx");
    expect(composer).toMatch(
      /data-chat-composer-transition-actions="true"[\s\S]{0,600}?"data-fork-composer-action": "send",\s*"data-fork-composer-send-tone": "flat"/u,
    );
    expect(composer).toMatch(
      /data-chat-composer-transition-actions[\s\S]{0,2400}?M18 8\.5V12\.5H6/u,
    );
  });
});
