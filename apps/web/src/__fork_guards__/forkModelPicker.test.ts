// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-model-picker`.
 *
 * Two shadows turn the model picker into a cascade menu: ProviderModelPicker
 * swaps upstream's Popover for a Menu, and ModelPickerContent renders the
 * providers with their models in hover submenus. A sync that deletes either
 * falls back to upstream's rail-and-list popover with no error, and a sync
 * that changes the props or helpers upstream wires between them breaks only at
 * runtime (relative imports type-check against upstream — see
 * overrides/README.md). Assert the outcomes the cascade and the wiring rely on.
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
const picker = readSibling("../overrides/components/chat/ProviderModelPicker.tsx");
const upstreamContent = readSibling("../components/chat/ModelPickerContent.tsx");
const upstreamPicker = readSibling("../components/chat/ProviderModelPicker.tsx");
const visibility = readSibling("../modelPickerVisibility.ts");

describe("fork guard: fork-model-picker", () => {
  it("keeps the content shadow API-compatible with what the picker passes", () => {
    expect(content).toContain(
      "export const ModelPickerContent = memo(function ModelPickerContent(",
    );
    expect(picker).toContain(
      "export const ProviderModelPicker = memo(function ProviderModelPicker(",
    );
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
      "onOpenProviderSetup",
      "getModelDisabledReason",
      "onInstanceModelChange",
    ]) {
      // Optional props are spread conditionally (`{ keybindings: ... }`).
      expect(picker, prop).toMatch(new RegExp(`\\b${prop}[=:]`, "u"));
      expect(content, prop).toMatch(new RegExp(`^\\s+${prop}\\??:`, "mu"));
    }
  });

  it("keeps upstream's exported helpers verbatim in the content shadow", () => {
    // ProviderModelPicker and upstream tests import these from the module the
    // shadow replaces; each body must match upstream's exactly.
    for (const name of [
      "resolveModelPickerSelectedModel",
      "shouldIncludeModelPickerOption",
      "shouldOfferModelPickerSetup",
    ]) {
      const body = (source: string) => {
        const start = source.indexOf(`export function ${name}(`);
        return source.slice(start, source.indexOf("\n}\n", start));
      };
      expect(body(upstreamContent), name).not.toBe("");
      expect(body(content), name).toBe(body(upstreamContent));
    }
  });

  it("keeps upstream's relative imports so a sync diffs cleanly", () => {
    for (const [name, shadow] of [
      ["content", content],
      ["picker", picker],
    ] as const) {
      expect(shadow, name).not.toMatch(/from "~\/components\//u);
      expect(shadow, name).not.toMatch(
        /from "~\/(?:keybindings|providerInstances|modelOrdering)"/u,
      );
    }
    expect(picker).toContain('from "./ModelPickerContent"');
    expect(content).toContain('from "../ui/menu"');
  });

  it("swaps only the Popover shell for a non-modal Menu", () => {
    expect(upstreamPicker).toContain('from "../ui/popover"');
    expect(picker).not.toContain('from "../ui/popover"');
    expect(picker).toContain('import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";');
    // Non-modal like the popover it replaces; upstream's wheel lock stays.
    expect(picker).toMatch(/<Menu\s+modal=\{false\}/u);
    expect(picker).toContain('closest("[data-model-picker-content]")');
    expect(picker).toContain("props.isComposerOwned ? composerFloatingLayerProps : {}");
  });

  it("drops the provider name wherever the provider is already shown", () => {
    // Trigger: the icon names the provider, so no rule may hide it.
    expect(picker).toContain(
      "stripProviderName(getTriggerDisplayModelName(selectedModel), activeEntry)",
    );
    expect(picker).toMatch(/\{activeEntry \? \(\s*<ProviderInstanceIcon/u);
    for (const rule of cssRules(theme)) {
      if (rule.selector.includes("[data-chat-provider-model-picker]")) {
        expect(rule.body, rule.selector).not.toMatch(/display:\s*none/u);
      }
    }
    // Rows: the submenu or the inline provider label names it.
    expect(content).toContain("const modelName = stripProviderName(displayName, {");
  });

  it("cascades providers into hover submenus, favorites first", () => {
    expect(content).toContain("<MenuSub>");
    expect(content).toContain("<MenuSubPopup");
    expect(content).toContain('data-model-picker-provider="favorites"');
    expect(content.indexOf('data-model-picker-provider="favorites"')).toBeLessThan(
      content.indexOf("{providerEntries.map(renderProviderRow)}"),
    );
    // Legacy models sit one submenu deeper, not inline.
    expect(content).toMatch(/legacy\.length > 0\s*\?\s*renderSubmenu\(/u);
    // Disabled providers keep pointer events so the reason tooltip opens.
    expect(content).toContain('isDisabled && "data-disabled:pointer-events-auto"');
    expect(content).toContain("describeUnavailableInstance(entry)");
    expect(content).toContain("Start a new thread to switch providers.");
    expect(content).toContain("Open provider setup");
  });

  it("stamps every popup level for shortcuts, wheel lock and the composer", () => {
    // Each submenu portals out on its own; without the markers the model
    // shortcuts, the wheel lock and the resting composer all misread it.
    expect(visibility).toContain('"[data-model-picker-content]"');
    expect(content.match(/data-model-picker-content="true"/gu)?.length).toBe(2);
    expect(content.match(/data-fork-model-picker="true"/gu)?.length).toBe(2);
    expect(content).toContain("{...composerFloatingLayerProps}");
  });

  it("searches every provider's models as one flat list", () => {
    // Typing anywhere in the cascade lands in the search field, ahead of the
    // menu's type-ahead.
    expect(content).toContain("onKeyDownCapture={redirectTypingToSearch}");
    expect(content).toContain("setSearchQuery((query) => query + event.key);");
    // A query swaps the providers for the flat results, provider shown inline.
    expect(content).toMatch(
      /\{isSearching \? \(\s*searchResults\.length > 0 \?[\s\S]*?renderModelItem\(model, true\)/u,
    );
    expect(content).toContain(".filter((model) => matchesLockedProvider(model))");
    // Escape clears a query before it can close the menu.
    expect(content).toMatch(/if \(event\.key === "Escape" && searchQuery\) \{/u);
  });

  it("renders models as 32px rows, star on hover, check on the selected one", () => {
    expect(content).toMatch(
      /const ROW_CLASS =\s*"h-8 min-h-8 rounded-\[4px\] [^"]*text-xs font-medium/u,
    );
    expect(content).toContain('<CheckIcon className="size-4 shrink-0 text-foreground"');
    // The star is hidden at rest even on favorited rows, and its click must
    // not also choose the row.
    expect(content).toContain(
      '"opacity-0 transition-opacity group-hover:opacity-100 group-data-highlighted:opacity-100"',
    );
    expect(content).toMatch(
      /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*toggleFavorite\(model\.instanceId, model\.slug\);/u,
    );
    // The jump badge's fill is foreground-relative; a white wash vanishes on a
    // light popup.
    expect(content).toContain("bg-foreground/4");
    expect(content).not.toMatch(/bg-white\//u);
  });

  it("keeps ⌘1–9 jumping through the list the user is choosing from", () => {
    expect(content).toContain('const jumpIndex = modelPickerJumpIndexFromCommand(command ?? "");');
    expect(content).toContain('window.addEventListener("keydown", onWindowKeyDown, true);');
    expect(content).toMatch(
      /if \(isSearching\) return searchResults;\s*if \(favoriteModels\.length > 0\) return favoriteModels;/u,
    );
  });

  it("rounds every picker popup level to 8px, scoped to the picker", () => {
    // Submenu popups are slotted menu-sub-content, not menu-popup.
    const popup = cssRules(theme).find((rule) =>
      rule.selector.includes(
        ':is([data-slot="menu-popup"], [data-slot="menu-sub-content"]):has([data-fork-model-picker])',
      ),
    );
    expect(popup?.selector).toContain(MARKER);
    expect(popup?.body).toMatch(/border-radius:\s*8px/u);
  });
});
