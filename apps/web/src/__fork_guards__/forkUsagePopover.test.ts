// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-usage-popover`.
 *
 * Usage is a popover over the current thread. A sync that restores the
 * sidebar's navigate-to-/usage door, or drops the panel chrome on UsagePage,
 * silently brings the dedicated page back.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const usagePopover = readSibling("../custom/UsagePopover.tsx");
const chromeRows = readSibling("../custom/SidebarV2ChromeRows.tsx");
const sidebar = readSibling("../components/Sidebar.tsx");
const usagePage = readSibling("../components/usage/UsagePage.tsx");
const usageDocs = readSibling("../../../../docs/user/usage.md");
const sidebarDocs = readSibling("../../../../docs/user/thread-sidebar.md");
const theme = readSibling("../theme.custom.css");
const palettes = readSibling("../theme.custom.palettes.css");

describe("fork guard: fork-usage-popover", () => {
  it("opens Usage as a popover from the chrome row", () => {
    expect(chromeRows).toContain("<SidebarV2UsageRow");
    expect(chromeRows).not.toContain("onUsage");
    expect(chromeRows).toContain('testId="sidebar-v2-usage"');
    expect(chromeRows).toContain("icon={ChartDonutIcon}");
    expect(usagePopover).toContain('data-testid="usage-popover"');
    expect(usagePopover).not.toContain("data-fork-glass-usage");
    expect(usagePopover).toContain('chrome="panel"');
    expect(usagePopover).toContain('side="right"');
    expect(usagePopover).toContain("w-[min(56rem,var(--available-width,calc(100vw-2rem)))]");
    expect(usagePopover).toContain("useSidebar");
    expect(usagePopover).toContain("DialogPopup");
    expect(usagePopover).toContain("max-sm:h-[calc(100dvh-3rem)] max-sm:w-full");
    expect(usagePage).toContain("flex-wrap items-center gap-x-3 gap-y-2 py-2");
    expect(sidebar).not.toContain('void router.navigate({ to: "/usage" });');
    expect(sidebar).not.toContain("handleUsageClick");
  });

  it("loads the dashboard lazily so the /usage chunk stays out of the main bundle", () => {
    expect(usagePopover).toMatch(/lazy\(\(\) =>\s*import\("~\/components\/usage\/UsagePage"\)/u);
    expect(usagePopover).toContain("<Suspense fallback={null}>");
    expect(usagePopover).not.toMatch(/^import .*~\/components\/usage\/UsagePage/mu);
  });

  it("renders the usage dashboard as a panel, not a workspace page", () => {
    expect(usagePage).toContain('chrome === "panel"');
    expect(usagePage).toContain('data-testid="usage-panel"');
    expect(usagePage).toContain("fork-usage-popover");
    // The panel is the frost's interior: an opaque bg-background here covers
    // the overlay from inside, which is how the popover read as a card.
    const panelAt = usagePage.indexOf('data-testid="usage-panel"');
    expect(panelAt).toBeGreaterThan(-1);
    const panelOpen = usagePage.lastIndexOf("<div", panelAt);
    expect(usagePage.slice(panelOpen, panelAt)).not.toContain("bg-background");
    // The hoisted body is one fence end to end, not just the panel branches
    // inside it: the re-indented upstream JSX must show the fork's boundary
    // when a sync conflicts there.
    expect(usagePage).toMatch(/fork:begin fork-usage-popover[\s\S]{0,400}?const usageBody = \(/u);
    expect(usagePage).toMatch(/<\/>\s*\);\s*\/\* fork:end fork-usage-popover \*\//u);
  });

  it("frosts both shells on the popup recipe, the dialog included", () => {
    // Both shells carry dropdown-glass. The popover is a popover-popup like
    // any other; the dialog is the one dialog-popup on the popup frost
    // (fork-popup-surface), so that rule carries a dialog arm for it.
    const frost = cssRules(theme).find(
      (rule) =>
        rule.selector.includes('[data-slot="dialog-popup"]') &&
        /backdrop-filter: blur\(\d+px\)/u.test(rule.body),
    );
    expect(frost?.selector).toContain('[data-slot="popover-popup"]');
    expect(frost?.selector).toContain(".dropdown-glass");
    // Under Glass the utility clear flattens dialogs, and must skip this one
    // by the class it shares with the popups rather than a stamp.
    const strip = cssRules(palettes).find(
      (rule) =>
        rule.selector.includes('[data-fork-sidebar-vibrancy="true"]') &&
        rule.selector.includes(".dialog-glass") &&
        rule.body.includes("--glass-opacity: 100%"),
    );
    expect(strip?.selector).toContain(".dialog-glass:not(.dropdown-glass)");
    expect(strip?.selector).not.toContain(".dropdown-glass:not(");
  });

  it("describes Usage as an overlay over the current thread", () => {
    expect(usageDocs).toMatch(/sits over the thread you\s+are looking at/u);
    expect(sidebarDocs).toContain("opens a popover over the current thread");
    expect(sidebarDocs).not.toContain("opens the usage page");
  });
});
