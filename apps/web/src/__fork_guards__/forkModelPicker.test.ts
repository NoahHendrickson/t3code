// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-model-picker`.
 *
 * Three presentational shadows (content, provider tabs, row) restack the
 * model picker to Figma 342:8038. A sync that deletes any of them falls back
 * to upstream's rail-and-two-line-rows layout with no error, and a sync that
 * changes the props ProviderModelPicker passes breaks the content shadow at
 * runtime only (relative imports type-check against upstream — see
 * overrides/README.md). Assert the outcomes the design and the wiring rely on.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const theme = readSibling("../theme.custom.css");
const content = readSibling("../overrides/components/chat/ModelPickerContent.tsx");
const tabs = readSibling("../overrides/components/chat/ModelPickerSidebar.tsx");
const row = readSibling("../overrides/components/chat/ModelListRow.tsx");
const upstreamContent = readSibling("../components/chat/ModelPickerContent.tsx");
const picker = readSibling("../components/chat/ProviderModelPicker.tsx");
const visibility = readSibling("../modelPickerVisibility.ts");

describe("fork guard: fork-model-picker", () => {
  it("keeps the shadows API-compatible with the modules they replace", () => {
    expect(content).toContain(
      "export const ModelPickerContent = memo(function ModelPickerContent(",
    );
    expect(tabs).toContain("export const ModelPickerSidebar = memo(function ModelPickerSidebar(");
    expect(row).toContain("export const ModelListRow = memo(function ModelListRow(");
    // Every prop ProviderModelPicker hands the content must still be accepted.
    for (const prop of [
      "activeInstanceId",
      "model",
      "lockedProvider",
      "lockedContinuationGroupKey",
      "instanceEntries",
      "keybindings",
      "modelOptionsByInstance",
      "terminalOpen",
      "onRequestClose",
      "getModelDisabledReason",
      "onInstanceModelChange",
    ]) {
      // Optional props are spread conditionally (`{ keybindings: ... }`).
      expect(picker, prop).toMatch(new RegExp(`\\b${prop}[=:]`, "u"));
      expect(content, prop).toMatch(new RegExp(`^\\s+${prop}\\??:`, "mu"));
    }
  });

  it("keeps the selector the shortcut layer and scroll-lock read", () => {
    expect(visibility).toContain('"[data-model-picker-content]"');
    expect(picker).toContain('closest("[data-model-picker-content]")');
    expect(content).toContain('data-model-picker-content="true"');
    expect(content).toContain('data-fork-model-picker="true"');
  });

  it("keeps upstream's relative imports so a sync diffs cleanly", () => {
    // overrides/README.md: a shadow keeps the copy import-identical to
    // upstream. `./ModelListRow` from inside the shadow tree resolves to the
    // sibling shadow; everything else falls through to upstream.
    for (const [name, shadow] of [
      ["content", content],
      ["tabs", tabs],
      ["row", row],
    ] as const) {
      expect(shadow, name).not.toMatch(/from "~\/components\//u);
      expect(shadow, name).not.toMatch(
        /from "~\/(?:keybindings|providerInstances|modelOrdering)"/u,
      );
    }
    expect(content).toContain('from "./ModelListRow"');
    expect(content).toContain('from "./ModelPickerSidebar"');
    expect(content).toContain('from "../ui/combobox"');
  });

  it("lays the providers out as a tab strip, favorites first, 32px tabs", () => {
    // Toggle buttons, not ARIA tabs: there is no tabpanel and the combobox
    // owns the arrow keys, so `role="tab"` would promise a pattern the
    // widget does not implement.
    expect(tabs).not.toContain('role="tab');
    expect(tabs).toContain('aria-pressed={props.selectedInstanceId === "favorites"}');
    expect(tabs).toContain("aria-pressed={isSelected}");
    expect(tabs).toContain('from "@phosphor-icons/react"');
    expect(tabs).toContain('data-model-picker-provider="favorites"');
    expect(tabs.indexOf('data-model-picker-provider="favorites"')).toBeLessThan(
      tabs.indexOf("data-model-picker-provider={entry.instanceId}"),
    );
    expect(tabs).toMatch(/const TAB_CLASS =\s*"[^"]*\bsize-8\b/u);
    expect(tabs).toMatch(/const SELECTED_TAB_CLASS = "[^"]*bg-foreground\/16/u);
    // The rail's unavailable / locked tooltips and badges survive the reflow.
    expect(tabs).toContain("describeUnavailableInstance(entry)");
    expect(tabs).toContain("getDisabledInstanceTooltip");
    expect(tabs).toContain("newBadgeInstanceIds");
    expect(tabs).toContain("shouldShowInstanceBadge(entry, props.instanceEntries)");
  });

  it("keeps the selected tab in view and fades the edge with more tabs", () => {
    // The strip hides its scrollbar and holds about six tabs, so without
    // these a seventh instance is selectable but invisible.
    expect(tabs).toContain(
      "find((tab) => tab.dataset.modelPickerProvider === props.selectedInstanceId)",
    );
    expect(tabs).toContain("strip.scrollLeft += tabRect.left - stripRect.left;");
    expect(tabs).toContain("strip.scrollLeft += tabRect.right - stripRect.right;");
    expect(tabs).toContain("onScroll={updateOverflow}");
    expect(tabs).toMatch(/overflow\.start && overflow\.end && STRIP_FADE_BOTH_CLASS/u);
    expect(tabs).toMatch(/STRIP_FADE_END_CLASS =\s*"\[mask-image:linear-gradient\(to_right,/u);
  });

  it("puts a search toggle beside the tabs and keeps the input mounted", () => {
    expect(content).toContain('aria-label="Search models"');
    expect(content).toContain('aria-label="Close search"');
    expect(content).toContain(
      'searchVisible ? "flex h-8 min-w-0 flex-1 items-center gap-1" : "sr-only"',
    );
    expect(content).toContain(
      "const showSidebar = !searchVisible && sidebarInstanceEntries.length > 0;",
    );
    // Escape backs out of search before it closes the popover.
    expect(content).toMatch(/if \(searchVisible\) \{\s*closeSearch\(\);\s*return;\s*\}/u);
    // Both class props land on Input's wrapper span, which is display:inline
    // under `unstyled`; without `flex h-8` the fill paints a 17px line box
    // around a 32px input.
    expect(content).toContain(
      'inputClassName="flex h-8 w-full items-center rounded-lg bg-foreground/8 text-xs"',
    );
  });

  it("lists every provider's current models as soon as search opens", () => {
    // Search open with nothing typed shows the whole catalogue (locked
    // provider still respected, legacy models held back for a query),
    // ordered by instance, favorites not regrouped.
    expect(content).toMatch(
      /if \(searchOpen\) \{\s*result = result\.filter\(\(m\) => !m\.isLegacy\);\s*if \(props\.lockedProvider !== null\) \{[^}]*matchesLockedProvider[^}]*\}\s*return sortProviderModelItems\(result, \{\s*favoriteModelKeys: favoritesSet,\s*groupFavorites: false,\s*instanceOrder,\s*\}\);/u,
    );
    // The untyped catalogue must not remap ⌘1–9 onto another provider.
    expect(content).toMatch(/if \(searchOpen && !isSearching\) \{\s*return mapping;\s*\}/u);
    // Legacy models list inline and rows carry provider glyphs whenever the
    // list mixes providers — keyed on the visible search, not only a query.
    expect(content).toContain('if (searchVisible || selectedInstanceId === "favorites") {');
    expect(content).toContain('showProvider={searchVisible || selectedInstanceId === "favorites"}');
  });

  it("renders models as 32px single-line rows with a check on the selected one", () => {
    expect(content).toContain("const MODEL_ROW_HEIGHT = 32;");
    expect(content).toContain("estimatedItemSize={MODEL_ROW_HEIGHT}");
    expect(content).not.toContain("ItemSeparatorComponent");
    expect(row).toMatch(/"group relative h-8 min-h-8 w-full/u);
    expect(row).toContain("props.isSelected ? (");
    expect(row).toContain("<CheckIcon");
    // Favoriting stays reachable: the star is revealed, not removed.
    expect(row).toContain("props.onToggleFavorite()");
    expect(row).toContain("group-data-highlighted:opacity-100");
    // Provider glyph plus the instance name replace the footer wherever rows
    // mix providers — the glyph is per driver, so it cannot tell two Codex
    // accounts apart on its own.
    expect(row).toContain("props.showProvider && ProviderIcon");
    expect(row).toMatch(/props\.showProvider \? \(\s*<span[^>]*>\s*\{providerLabel\}/u);
    // The jump badge's fill is foreground-relative like every other fork
    // alpha here; a white wash vanishes on a light popup and drops Kbd's own.
    expect(row).toContain("bg-foreground/4");
    expect(row).not.toMatch(/bg-white\//u);
  });

  it("gives the virtualized list a definite height", () => {
    // LegendList windows against its scroll container's height; an
    // auto-height parent would mount every row. Content-sized up to the cap.
    expect(content).toContain(
      "const listHeight = Math.min(filteredItemKeys.length * MODEL_ROW_HEIGHT, MODEL_LIST_MAX_HEIGHT);",
    );
    expect(content).toContain("style={{ height: listHeight }}");
    expect(content).toMatch(/"scrollbar-gutter-stable h-full overflow-x-hidden/u);
    expect(content).not.toContain("ResizeObserver");
  });

  it("keeps the logic half of the content shadow a verbatim copy of upstream", () => {
    // The render was rewritten; the model/search/keyboard plumbing above it
    // was not. Pin a few load-bearing upstream lines so a sync that changes
    // them upstream is noticed here rather than diverging silently.
    for (const line of [
      "const resolvedModel = resolveSelectableModel(entry.driverKind, modelSlug, options);",
      'const jumpIndex = modelPickerJumpIndexFromCommand(command ?? "");',
      'window.addEventListener("keydown", onWindowKeyDown, true);',
      'groupFavorites: selectedInstanceId !== "favorites",',
    ]) {
      expect(upstreamContent, line).toContain(line);
      expect(content, line).toContain(line);
    }
  });

  it("rounds the picker popup to the design's 12px, scoped to the picker", () => {
    const rules = cssRules(theme);
    const popup = rules.find(
      (rule) =>
        rule.selector.includes('[data-slot="popover-popup"]:has([data-fork-model-picker])') &&
        !rule.selector.includes("::before"),
    );
    expect(popup?.selector).toContain(MARKER);
    expect(popup?.body).toMatch(/border-radius:\s*12px/u);
    const viewport = rules.find((rule) =>
      rule.selector.includes('[data-slot="popover-viewport"]:has(> [data-fork-model-picker])'),
    );
    expect(viewport?.body).toMatch(/clip-path:\s*inset\(0 round 11px\)/u);
  });
});
