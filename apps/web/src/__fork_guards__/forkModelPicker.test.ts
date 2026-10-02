// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-model-picker`.
 *
 * Two shadows turn the model picker into a paged menu: ProviderModelPicker
 * swaps upstream's Popover for a Menu, and ModelPickerContent renders the
 * providers first, then a provider's models in place. In the composer,
 * ComposerModelPicker adds the reasoning panel under the pages, replacing the
 * separate traits picker. A sync that deletes either shadow
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
const composer = readSibling("../components/chat/ChatComposer.tsx");
const composerPicker = readSibling("../custom/ComposerModelPicker.tsx");

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
    expect(picker).toContain(
      'import { Menu, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";',
    );
    // Non-modal like the popover it replaces; upstream's wheel lock stays.
    expect(picker).toMatch(/<Menu\s+modal=\{false\}/u);
    expect(picker).toContain('closest("[data-model-picker-content]")');
    expect(picker).toContain(
      "const floatingLayerProps = props.isComposerOwned ? composerFloatingLayerProps : {};",
    );
    expect(picker).toMatch(/<MenuPopup\s+\{\.\.\.floatingLayerProps\}/u);
  });

  it("drops the provider name wherever the provider is already shown", () => {
    // Trigger: the composer shows the name alone, but its resting strip
    // collapses the label below 640px, so the icon must come back there;
    // Settings keeps the icon, and no stylesheet rule may hide it. The
    // tooltip names the instance the hidden icon used to.
    expect(picker).toContain(
      "stripProviderName(getTriggerDisplayModelName(selectedModel), activeEntry)",
    );
    expect(picker).toMatch(/\{activeEntry \? \(\s*<ProviderInstanceIcon/u);
    // One class for the single icon and the multi-model avatar stack alike.
    expect(picker).toContain(
      'const composerIconClassName =\n    props.isComposerOwned &&\n    (size === "xs" ? "hidden @max-[640px]/composer-surface:inline-flex" : "hidden")',
    );
    expect(picker).toMatch(
      /\{activeEntry \? \(\s*<span[^>]*>\{activeEntry\.displayName\}<\/span>/u,
    );
    for (const rule of cssRules(theme)) {
      if (rule.selector.includes("[data-chat-provider-model-picker]")) {
        expect(rule.body, rule.selector).not.toMatch(/display:\s*none/u);
      }
    }
    // Rows: the submenu or the inline provider label names it.
    expect(content).toContain("const modelName = stripProviderName(displayName, {");
  });

  it("pages from providers to a provider's models, favorites first", () => {
    // Rows swap the page in place; no submenu ever portals out.
    expect(content).not.toContain("<MenuSub");
    expect(content).toContain('data-model-picker-page-link="true"');
    expect(content).toContain(
      'target: { kind: "models", instanceId: entry.instanceId, legacy: false }',
    );
    expect(content).toContain('data-model-picker-back="true"');
    expect(content).toContain('providerId: "favorites"');
    expect(content.indexOf('providerId: "favorites"')).toBeLessThan(
      content.indexOf("{providerEntries.map(renderProviderRow)}"),
    );
    // Legacy models sit one page deeper, not inline.
    expect(content).toContain('target: { kind: "models", instanceId, legacy: true }');
    // A row swaps the page and focuses the search field only later: focusing
    // it from the click races the menu's focus-out check against the removed
    // row and closes the menu.
    expect(content).toMatch(
      /setPage\(next\);\s*window\.requestAnimationFrame\(focusSearchInput\);\s*window\.setTimeout\(focusSearchInput, 0\);/u,
    );
    // The menu parks focus on the popup after a swap; typing still searches.
    expect(content).toContain("closest<HTMLElement>('[data-slot=\"menu-popup\"]')");
    expect(content).toContain("if (event.target === popup) redirectTypingToSearch(event);");
    // Backspace held to clear a query stops at the empty field.
    expect(content).toContain("if (!event.repeat) openPage(parentPage(page));");
    // Disabled providers keep pointer events so the reason tooltip opens.
    expect(content).toContain('input.disabled && "data-disabled:pointer-events-auto"');
    expect(content).toContain("describeUnavailableInstance(entry)");
    expect(content).toContain("Start a new thread to switch providers.");
    expect(content).toContain("Open provider setup");
  });

  it("stamps the popup for shortcuts and the wheel lock", () => {
    expect(visibility).toContain('"[data-model-picker-content]"');
    expect(content.match(/data-model-picker-content="true"/gu)?.length).toBe(1);
    expect(content.match(/data-fork-model-picker="true"/gu)?.length).toBe(1);
  });

  it("searches every provider's models as one flat list", () => {
    // Typing anywhere in the cascade lands in the search field, ahead of the
    // menu's type-ahead.
    expect(content).toContain("onKeyDownCapture={redirectTypingToSearch}");
    expect(content).toContain("setSearchQuery((query) => query + event.key);");
    // A query swaps any page for the flat results, provider shown inline.
    expect(content).toMatch(
      /const renderPage = \(\) => \{\s*if \(isSearching\) \{\s*return searchResults\.length > 0 \?[\s\S]*?renderModelItem\(model, true\)/u,
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
      /if \(isSearching\) return searchResults;\s*if \(page\.kind === "favorites"\) return favoriteModels;/u,
    );
  });

  it("carries reasoning in the composer's one model menu", () => {
    // Both composer placements (footer and resting strip) render the combined
    // picker; no standalone traits picker sits beside it, and the ⋯ menu no
    // longer repeats the traits.
    expect(
      composer.match(/<ComposerModelPicker\s+traitsInput=\{providerTraitsPickerInput\}/gu),
    ).toHaveLength(2);
    expect(composer).not.toMatch(/<ProviderModelPicker\b/u);
    expect(composer).not.toMatch(/^\s*const providerTraitsPicker = /mu);
    expect(composer).not.toMatch(/^\s*id: "traits",/mu);
    // Upstream's ⋯-menu traits wiring is dropped too, not left built and unread.
    expect(composer).not.toMatch(/renderProviderTraitsMenuContent\(/u);
    expect(composer).not.toMatch(/^\s*traitsMenuContent=/mu);
    // The trigger reads "Opus 5.5 High"; the panel sits under the pages, and a
    // pick keeps the menu open so effort can follow.
    expect(picker).toContain("data-chat-provider-model-picker-traits");
    // The traits label truncates inside the trigger's max width, and the
    // resting strip collapses it (and the bolt) with the model name.
    expect(picker).toContain('"min-w-0 truncate text-muted-foreground"');
    expect(
      picker.match(/size === "xs" && "@max-\[640px\]\/composer-surface:hidden"/gu),
    ).toHaveLength(2);
    // The panel is stamped like the pages, so the wheel lock and
    // modelPickerHoldsFocus both count its controls as inside the picker.
    expect(picker).toContain('<div data-model-picker-content="true">{props.traits.panel}</div>');
    // Anchored to the trigger's right edge, which stays put as the label changes length.
    expect(picker).toContain('align={props.isComposerOwned ? "end" : "start"}');
    // Every pick in the composer keeps it open, even from a model without
    // traits; only Settings closes on a pick.
    expect(picker).toContain("if (!props.combined) setIsMenuOpen(false);");
    expect(composerPicker).toMatch(/<ProviderModelPicker\s+\{\.\.\.pickerProps\}\s+combined\b/u);
    expect(content).toContain("closeOnClick={false}");
    // Nothing pulls focus into the editor while the picker stays open across
    // a pick: ChatView's post-pick focusAtEnd stands down, and the editor's
    // rewrite on a provider switch skips placing the DOM selection.
    expect(composer).toMatch(
      /focusAtEnd: \(\) => \{[^}]*?if \(isComposerModelPickerOpen\) \{\s*composerFocusOwedRef\.current = true;\s*return;\s*\}/u,
    );
    // The focus it skipped is paid when the picker closes, unless the close
    // itself moved focus to another control.
    expect(composer).toMatch(
      /if \(isComposerModelPickerOpen \|\| !composerFocusOwedRef\.current\) return;\s*composerFocusOwedRef\.current = false;[\s\S]*?modelPickerHoldsFocus\(\)\s*\) \{\s*composerEditorRef\.current\?\.focusAtEnd\(\);/u,
    );
    // The editor is Tiptap now (upstream sync 2026-10-02): ProseMirror's
    // selectionToDOM returns unless editorOwnsSelection(view), so an unfocused
    // editor's rewrite never pulls the DOM selection — the Lexical-era
    // SKIP_DOM_SELECTION_TAG hunk has no host and no job. Pin the condition
    // the controlled-update effect keys on so a rewrite that starts focusing
    // the view unconditionally turns this red.
    const tiptap = readSibling("../components/ComposerPromptEditorTiptap.tsx");
    expect(tiptap).toContain(
      "const isFocused = Boolean(rootElement && document.activeElement === rootElement);",
    );
    // Nothing between that read and the effect's dependency list may focus
    // the view; focusAt (the explicit, caller-driven focus) sits after it.
    const effectStart = tiptap.indexOf("const isFocused = Boolean(rootElement");
    const effectEnd = tiptap.indexOf("}, [cursor, editor, richText, skillLabelFor, value]);");
    expect(effectStart).toBeGreaterThan(0);
    expect(effectEnd).toBeGreaterThan(effectStart);
    expect(tiptap.slice(effectStart, effectEnd)).not.toMatch(/\.focus\(/u);
    // Effort is a slider over the model's own levels; its keys stay out of
    // the menu's navigation.
    expect(composerPicker).toContain("<Slider.Root");
    expect(composerPicker).toContain("onValueCommitted");
    expect(composerPicker).toContain(
      'if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();',
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
