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

  it("lays the providers out as a tab strip, favorites first, 32px tabs", () => {
    expect(tabs).toContain('role="tablist"');
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

  it("lists every provider's models as soon as search opens", () => {
    // Search open with nothing typed shows the whole catalogue (locked
    // provider still respected), ordered by instance, favorites not regrouped.
    expect(content).toMatch(
      /if \(searchOpen\) \{\s*if \(props\.lockedProvider !== null\) \{[^}]*matchesLockedProvider[^}]*\}\s*return sortProviderModelItems\(result, \{\s*favoriteModelKeys: favoritesSet,\s*groupFavorites: false,\s*instanceOrder,\s*\}\);/u,
    );
    // Legacy models list inline and rows carry provider glyphs whenever the
    // list mixes providers — keyed on the visible search, not only a query.
    expect(content).toContain('if (searchVisible || selectedInstanceId === "favorites") {');
    expect(content).toContain('showProvider={searchVisible || selectedInstanceId === "favorites"}');
  });

  it("renders models as 32px single-line rows with a check on the selected one", () => {
    expect(content).toContain("estimatedItemSize={32}");
    expect(content).not.toContain("ItemSeparatorComponent");
    expect(row).toMatch(/"group relative h-8 min-h-8 w-full/u);
    expect(row).toContain("props.isSelected ? (");
    expect(row).toContain("<CheckIcon");
    // Favoriting stays reachable: the star is revealed, not removed.
    expect(row).toContain("props.onToggleFavorite()");
    expect(row).toContain("group-data-highlighted:opacity-100");
    // Provider glyph replaces the footer wherever rows mix providers.
    expect(row).toContain("props.showProvider && ProviderIcon");
  });

  it("lets the popup grow but never shrink while open", () => {
    // The tallest height the content has reached is held as its min-height.
    expect(content).toContain("setHeightFloor((previous) => Math.max(previous, height));");
    expect(content).toContain("style={heightFloor > 0 ? { minHeight: heightFloor } : undefined}");
    expect(content).toContain("observer.observe(content);");
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
