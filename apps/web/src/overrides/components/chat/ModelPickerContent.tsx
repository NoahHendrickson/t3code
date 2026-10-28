/**
 * Fork shadow of upstream's ModelPickerContent — see
 * `.fork/customizations.yaml#fork-model-picker`.
 *
 * Same export, same props as upstream, so ProviderModelPicker's import is
 * untouched; the four exported helpers are upstream's verbatim. The render
 * is the fork's, hosted by ProviderModelPicker's shadow in a Base UI Menu: a
 * provider submenu (Favorites, then one option per provider instance), the
 * search field, then the chosen scope's models, legacy ones behind an inline
 * toggle. It opens on Favorites when there are favorites, else on the current
 * model's provider. Typing anywhere lands in the search field, and a query
 * swaps the list for one flat, provider-agnostic list of matching models.
 * Picking a model never closes the menu from here; the host decides, since it
 * may render more below the list. Upstream's multi-model draft (Shift-click
 * or Shift+Enter toggles a model into `selectedModels`) works the same way,
 * and its provider-cycling shortcuts step the provider menu.
 */
import {
  ANTIGRAVITY_DEFAULT_MODEL,
  type ProviderInstanceId,
  type EnvironmentId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { resolveSelectableModel } from "@t3tools/shared/model";
import { useAtomValue } from "@effect/atom-react";
import { formatProviderUpdateRequiredNotice } from "@t3tools/client-runtime/providerUpdateRequiredModels";
import { useNavigate } from "@tanstack/react-router";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, SetStateAction } from "react";
import { Heart } from "@phosphor-icons/react";
import { CheckIcon, ChevronDownIcon, SearchIcon, StarIcon } from "lucide-react";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { getProviderStatusMessage, hasProviderSetup } from "./ProviderStatusBanner";
import { rankModelPickerSearch } from "./modelPickerSearch";
import { getDisplayModelName, ModelEsque } from "./providerIconUtils";
import { MenuItem, MenuSeparator, MenuSub, MenuSubPopup, MenuSubTrigger } from "../ui/menu";
import { composerFloatingLayerProps } from "./composerEventScope";
import { Badge } from "../ui/badge";
import { Kbd } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { primaryServerKeybindingsAtom } from "../../state/server";
import {
  modelPickerJumpCommandForIndex,
  modelPickerJumpIndexFromCommand,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../../keybindings";
import {
  useEnvironmentModelPreferences,
  useToggleEnvironmentModelFavorite,
} from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { stripProviderName } from "~/custom/modelPickerDisplayName";
import {
  isProviderInstancePickerReady,
  isProviderInstancePickerVisible,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { providerModelKey, sortProviderModelItems } from "../../modelOrdering";

type ModelPickerItem = {
  slug: string;
  name: string;
  shortName?: string;
  subProvider?: string;
  instanceId: ProviderInstanceId;
  driverKind: ProviderDriverKind;
  instanceDisplayName: string;
  instanceAccentColor?: string | undefined;
  acpRegistryAgentId?: string | undefined;
  acpRegistryIconUrl?: string | undefined;
  continuationGroupKey?: string | undefined;
  isLegacy?: boolean | undefined;
  isUnavailable?: boolean | undefined;
};

export function resolveModelPickerSelectedModel(input: {
  driverKind: ProviderDriverKind | undefined;
  model: string;
  options: ReadonlyArray<ModelEsque>;
}) {
  if (input.driverKind === "antigravity" && input.model === ANTIGRAVITY_DEFAULT_MODEL) {
    const availableModels = input.options.filter(
      (option) => option.slug !== ANTIGRAVITY_DEFAULT_MODEL && !option.isUnavailable,
    );
    return (
      availableModels.find((option) => option.aliases?.includes(ANTIGRAVITY_DEFAULT_MODEL)) ??
      availableModels.find((option) => option.isDefault)
    );
  }
  return input.options.find((option) => option.slug === input.model);
}

export function shouldIncludeModelPickerOption(input: {
  readonly entry: ProviderInstanceEntry;
  readonly option: ModelEsque;
  readonly activeInstanceId: ProviderInstanceId;
  readonly activeModel: string;
}): boolean {
  if (input.entry.driverKind === "antigravity" && input.option.slug === ANTIGRAVITY_DEFAULT_MODEL) {
    return false;
  }
  if (isProviderInstancePickerReady(input.entry)) return true;
  return (
    input.entry.enabled &&
    (input.entry.driverKind === "opencode" || input.entry.driverKind === "antigravity") &&
    input.entry.instanceId === input.activeInstanceId &&
    input.option.slug === input.activeModel &&
    input.option.isUnavailable === true
  );
}

export function shouldOfferModelPickerSetup(
  entry: ProviderInstanceEntry,
  options: ReadonlyArray<ModelEsque>,
): boolean {
  return (
    entry.enabled &&
    entry.status !== "disabled" &&
    hasProviderSetup(entry.snapshot) &&
    (!isProviderInstancePickerReady(entry) ||
      !entry.installed ||
      entry.snapshot.auth.status === "unauthenticated" ||
      !options.some((option) => !option.isUnavailable))
  );
}

export function adjacentModelPickerProvider(input: {
  entries: ReadonlyArray<ProviderInstanceEntry>;
  selectedInstanceId: ProviderInstanceId | "favorites";
  direction: 1 | -1;
  disabledInstanceIds: ReadonlySet<ProviderInstanceId> | undefined;
  selectableUnavailableInstanceIds: ReadonlySet<ProviderInstanceId> | undefined;
}) {
  const providers: Array<ProviderInstanceId | "favorites"> = [
    "favorites",
    ...input.entries
      .filter(
        (entry) =>
          !input.disabledInstanceIds?.has(entry.instanceId) &&
          (isProviderInstancePickerReady(entry) ||
            input.selectableUnavailableInstanceIds?.has(entry.instanceId)),
      )
      .map((entry) => entry.instanceId),
  ];
  const index = providers.indexOf(input.selectedInstanceId);
  return providers[
    index < 0
      ? input.direction === 1
        ? 0
        : providers.length - 1
      : (index + input.direction + providers.length) % providers.length
  ]!;
}

/**
 * Build the hover tooltip for a provider row that cannot be opened, using
 * the entry's configured `displayName` so custom instances read as authored.
 */
function describeUnavailableInstance(entry: ProviderInstanceEntry): string {
  const label = entry.displayName;
  if (!entry.enabled || entry.status === "disabled") {
    return `${label} — Disabled in settings.`;
  }
  if (entry.status === "ready" && entry.isAvailable) {
    return label;
  }
  const kind =
    entry.status === "error" ? "Unavailable" : entry.status === "warning" ? "Limited" : "Not ready";
  const msg = entry.snapshot.message?.trim();
  return msg ? `${label} — ${kind}. ${msg}` : `${label} — ${kind}.`;
}

/** Keys the search field must see itself rather than the menu's navigation. */
/** A key press as both React and the popup's native listener see it. */
type TypedKeyEvent = Pick<
  globalThis.KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "target" | "preventDefault" | "stopPropagation"
>;

function isTypedCharacter(event: TypedKeyEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

const EMPTY_MODEL_JUMP_LABELS = new Map<string, string>();

/** Every row shares one shape: 32px, 4px corners, 12px medium label. */
const ROW_CLASS = "h-8 min-h-8 rounded-[4px] px-2 py-0 text-xs font-medium sm:min-h-8 sm:text-xs";
/** Hidden at rest, shown while the row is hovered or keyboard-highlighted. */
const HOVER_REVEAL_CLASS =
  "opacity-0 transition-opacity group-hover:opacity-100 group-data-highlighted:opacity-100";

/** Whose models the list shows when no query is typed: the provider menu's
    value. */
type ModelPickerScope = ProviderInstanceId | "favorites";

const TOOLTIP_CLASS = "max-w-64 text-balance font-normal leading-snug";

export const ModelPickerContent = memo(function ModelPickerContent(props: {
  environmentId: EnvironmentId | null;
  activeInstanceId: ProviderInstanceId;
  model: string;
  selectedModels?: ReadonlyArray<{ instanceId: ProviderInstanceId; model: string }>;
  onToggleModel?: (instanceId: ProviderInstanceId, model: string) => void;
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  terminalOpen: boolean;
  onRequestClose?: () => void;
  onOpenProviderSetup?: (instanceId: ProviderInstanceId) => void;
  getModelDisabledReason?: (instanceId: ProviderInstanceId, model: string) => string | null;
  onInstanceModelChange: (instanceId: ProviderInstanceId, model: string) => void;
}) {
  const {
    keybindings: providedKeybindings,
    modelOptionsByInstance,
    instanceEntries,
    getModelDisabledReason,
    onInstanceModelChange,
    onToggleModel,
  } = props;
  const [searchQuery, setSearchQueryState] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { favorites } = useEnvironmentModelPreferences(props.environmentId);
  const serverKeybindings = useAtomValue(primaryServerKeybindingsAtom);
  const keybindings = providedKeybindings ?? serverKeybindings;
  const toggleFavorite = useToggleEnvironmentModelFavorite(props.environmentId);
  const navigate = useNavigate();

  const activeEntry = instanceEntries.find((entry) => entry.instanceId === props.activeInstanceId);
  const activeModel = resolveModelPickerSelectedModel({
    driverKind: activeEntry?.driverKind,
    model: props.model,
    options: modelOptionsByInstance.get(props.activeInstanceId) ?? [],
  });
  const activeModelSlug =
    activeModel?.slug ?? (props.model === ANTIGRAVITY_DEFAULT_MODEL ? "" : props.model);
  // A multi-model draft checks every selected row; otherwise just the active one.
  const activeModelKey = activeModelSlug
    ? providerModelKey(props.activeInstanceId, activeModelSlug)
    : null;
  const selectedModelKeys = props.selectedModels?.map((selection) => {
    const entry = instanceEntries.find((entry) => entry.instanceId === selection.instanceId);
    const model = resolveModelPickerSelectedModel({
      driverKind: entry?.driverKind,
      model: selection.model,
      options: modelOptionsByInstance.get(selection.instanceId) ?? [],
    });
    return providerModelKey(selection.instanceId, model?.slug ?? selection.model);
  });
  const selectedModelKeySet = new Set(
    selectedModelKeys ?? (activeModelKey ? [activeModelKey] : []),
  );
  const activeInstanceHasSelectableUnavailableModel =
    activeEntry !== undefined &&
    (modelOptionsByInstance.get(props.activeInstanceId) ?? []).some((option) =>
      shouldIncludeModelPickerOption({
        entry: activeEntry,
        option,
        activeInstanceId: props.activeInstanceId,
        activeModel: activeModelSlug,
      }),
    ) &&
    !isProviderInstancePickerReady(activeEntry);

  const focusSearchInput = () => {
    searchInputRef.current?.focus({ preventScroll: true });
  };

  // The menu focuses its own popup as it opens; land on the search field
  // after it does, so typing searches straight away.
  useLayoutEffect(() => {
    focusSearchInput();
    const frame = window.requestAnimationFrame(focusSearchInput);
    const timeout = window.setTimeout(focusSearchInput, 0);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [focusSearchInput]);

  // Favorites are keyed by `${instanceId}:${slug}`; pre-migration favorites
  // keyed by driver slugs still resolve — the default instance id equals it.
  const favoritesSet = new Set(favorites.map((fav) => providerModelKey(fav.provider, fav.model)));
  const entryByInstanceId = new Map(instanceEntries.map((entry) => [entry.instanceId, entry]));
  const instanceOrder = instanceEntries.map((entry) => entry.instanceId);
  const matchesLockedProvider = (
    entry: Pick<ProviderInstanceEntry, "driverKind" | "continuationGroupKey">,
  ): boolean => {
    if (props.lockedProvider === null) return true;
    if (entry.driverKind !== props.lockedProvider) return false;
    if (!props.lockedContinuationGroupKey) return true;
    return entry.continuationGroupKey === props.lockedContinuationGroupKey;
  };

  // One pass over the instance-keyed map; each model carries its instance id
  // and driver kind so a row renders its glyph without another lookup.
  const flatModels = (() => {
    const out: ModelPickerItem[] = [];
    for (const [instanceId, models] of modelOptionsByInstance) {
      const entry = entryByInstanceId.get(instanceId);
      if (!entry) continue;
      for (const model of models) {
        if (
          !shouldIncludeModelPickerOption({
            entry,
            option: model,
            activeInstanceId: props.activeInstanceId,
            activeModel: activeModelSlug,
          })
        ) {
          continue;
        }
        out.push({
          slug: model.slug,
          name: model.name,
          ...(model.shortName ? { shortName: model.shortName } : {}),
          ...(model.subProvider ? { subProvider: model.subProvider } : {}),
          ...(model.isLegacy ? { isLegacy: true } : {}),
          ...(model.isUnavailable ? { isUnavailable: true } : {}),
          instanceId,
          driverKind: entry.driverKind,
          instanceDisplayName: entry.displayName,
          ...(entry.accentColor ? { instanceAccentColor: entry.accentColor } : {}),
          ...(entry.acpRegistryAgentId ? { acpRegistryAgentId: entry.acpRegistryAgentId } : {}),
          ...(entry.acpRegistryIconUrl ? { acpRegistryIconUrl: entry.acpRegistryIconUrl } : {}),
          ...(entry.continuationGroupKey
            ? { continuationGroupKey: entry.continuationGroupKey }
            : {}),
        });
      }
    }
    return out;
  })();

  const isSearching = searchQuery.trim().length > 0;

  // A query searches every provider's models (locked provider still
  // respected), ranked by match, favorites first on a tie.
  const searchResults = isSearching
    ? rankModelPickerSearch(
        flatModels.filter((model) => matchesLockedProvider(model)),
        searchQuery,
        (model) => ({
          name: model.name,
          ...(model.shortName ? { shortName: model.shortName } : {}),
          ...(model.subProvider ? { subProvider: model.subProvider } : {}),
          driverKind: model.driverKind,
          providerDisplayName: model.instanceDisplayName,
          isFavorite: favoritesSet.has(providerModelKey(model.instanceId, model.slug)),
        }),
      )
    : [];

  const favoriteModels = sortProviderModelItems(
    flatModels.filter(
      (model) =>
        matchesLockedProvider(model) &&
        favoritesSet.has(providerModelKey(model.instanceId, model.slug)),
    ),
    { favoriteModelKeys: favoritesSet, groupFavorites: false, instanceOrder },
  );

  // The menu remounts on every open and picks its scope once: Favorites when
  // one can be picked, else the current model's provider. Favorites that load
  // after the open join the provider menu rather than swapping the list.
  const [storedScope, setStoredScope] = useState<ModelPickerScope>(() =>
    favoriteModels.some((model) => !getModelDisabledReason?.(model.instanceId, model.slug))
      ? "favorites"
      : props.activeInstanceId,
  );
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  // Any edit to the query closes the provider submenu: a query hides the
  // scope behind the flat results. Closed rather than derived from
  // isSearching, which would pop the submenu back open when the query clears.
  const setSearchQuery = (next: SetStateAction<string>) => {
    setSearchQueryState(next);
    setProviderMenuOpen(false);
  };
  const [showLegacy, setShowLegacy] = useState(false);
  // The stored scope can name nothing to show: an emptied Favorites (the last
  // star removed, or its providers gone), or an instance that has since been
  // removed (a thread still on it). Either falls back to Favorites if any,
  // else the current model's provider, else the first listed, so the trigger
  // and the list always have a real scope. Only a picker with no provider
  // instances at all is left on an empty Favorites.
  const scopeEntry = (() => {
    const stored = storedScope === "favorites" ? undefined : entryByInstanceId.get(storedScope);
    if (stored) return stored;
    if (favoriteModels.length > 0) return "favorites";
    return (
      entryByInstanceId.get(props.activeInstanceId) ??
      instanceEntries.find(isProviderInstancePickerVisible) ??
      instanceEntries[0] ??
      "favorites"
    );
  })();
  const scope = scopeEntry === "favorites" ? "favorites" : scopeEntry.instanceId;

  const isLegacyModel = (model: ModelPickerItem) =>
    model.isLegacy === true && !favoritesSet.has(providerModelKey(model.instanceId, model.slug));
  const modelsForInstance = (instanceId: ProviderInstanceId) => {
    const models = sortProviderModelItems(
      flatModels.filter((model) => model.instanceId === instanceId),
      { favoriteModelKeys: favoritesSet, groupFavorites: true, instanceOrder: [] },
    );
    return {
      current: models.filter((model) => !isLegacyModel(model)),
      legacy: models.filter(isLegacyModel),
    };
  };

  const providerEntries = (() => {
    const visible = instanceEntries.filter(isProviderInstancePickerVisible);
    if (props.lockedProvider === null) return visible;
    // Locked: the thread's own providers first, the rest listed but disabled.
    return [
      ...visible.filter((entry) => matchesLockedProvider(entry)),
      ...visible.filter((entry) => !matchesLockedProvider(entry)),
    ];
  })();

  // The providers the cycling shortcuts may land on: locked-out instances
  // never, unready ones only while they hold the selected model or can offer
  // setup — the same options the provider menu leaves enabled.
  const lockedDisabledInstanceIds = (() => {
    if (props.lockedProvider === null) return undefined;
    const disabled = new Set<ProviderInstanceId>();
    for (const entry of instanceEntries) {
      if (!matchesLockedProvider(entry)) disabled.add(entry.instanceId);
    }
    return disabled;
  })();
  const selectableUnavailableInstanceIds = (() => {
    const instanceIds = new Set<ProviderInstanceId>();
    if (activeInstanceHasSelectableUnavailableModel) {
      instanceIds.add(props.activeInstanceId);
    }
    if (props.onOpenProviderSetup) {
      for (const entry of instanceEntries) {
        if (
          shouldOfferModelPickerSetup(entry, modelOptionsByInstance.get(entry.instanceId) ?? [])
        ) {
          instanceIds.add(entry.instanceId);
        }
      }
    }
    return instanceIds.size > 0 ? instanceIds : undefined;
  })();

  const handleModelSelect = (
    modelSlug: string,
    instanceId: ProviderInstanceId,
    additive = false,
  ) => {
    if (getModelDisabledReason?.(instanceId, modelSlug)) return;
    const options = modelOptionsByInstance.get(instanceId);
    const entry = entryByInstanceId.get(instanceId);
    if (!options || !entry) return;
    // `resolveSelectableModel` normalizes by driver kind; custom instances
    // share their driver's rules.
    const resolvedModel = resolveSelectableModel(entry.driverKind, modelSlug, options);
    if (resolvedModel) {
      if (additive && onToggleModel) {
        onToggleModel(instanceId, resolvedModel);
      } else {
        onInstanceModelChange(instanceId, resolvedModel);
      }
    }
  };

  // Swap first, focus later. Focusing the search field from the row's click
  // closes the menu: the row re-takes focus on click, and the field's focusout
  // is checked a microtask later against a row the swap already removed,
  // which the menu reads as focus leaving. A frame and a tick later, the swap
  // and that check have both run.
  // A query hides the scope behind the flat results, so choosing a scope
  // clears it.
  const selectScope = (next: ModelPickerScope, options?: { showLegacy?: boolean }) => {
    setSearchQuery("");
    setStoredScope(next);
    setShowLegacy(options?.showLegacy ?? false);
    window.requestAnimationFrame(focusSearchInput);
    window.setTimeout(focusSearchInput, 0);
  };

  // A pick from search results clears the query onto the model's own
  // provider, so the menu (if the host keeps it open) shows the check on the
  // new pick. Shift (`additive`) toggles the model into a multi-model draft
  // and keeps the query, so one search can collect several models, as
  // upstream's does.
  const chooseModel = (model: ModelPickerItem, additive = false) => {
    handleModelSelect(model.slug, model.instanceId, additive);
    if (!isSearching || additive) return;
    selectScope(model.instanceId, { showLegacy: isLegacyModel(model) });
  };

  // The cycling shortcuts step the provider menu. Favorites is skipped while there
  // are none to show.
  const cycleProvider = (direction: 1 | -1) => {
    const step = (selectedInstanceId: ProviderInstanceId | "favorites") =>
      adjacentModelPickerProvider({
        entries: providerEntries,
        selectedInstanceId,
        direction,
        disabledInstanceIds: lockedDisabledInstanceIds,
        selectableUnavailableInstanceIds,
      });
    let next = step(scope);
    if (next === "favorites" && favoriteModels.length === 0) next = step("favorites");
    if (next === "favorites" && favoriteModels.length === 0) return;
    selectScope(next);
  };

  // ⌘1–9 jump through the list on screen: the search results while
  // searching, else the scope's models in the order they are listed.
  const jumpModels = (() => {
    if (isSearching) return searchResults;
    if (scope === "favorites") return favoriteModels;
    const { current, legacy } = modelsForInstance(scope);
    return showLegacy ? [...current, ...legacy] : current;
  })();
  const jumpTargets = (() => {
    const targets: ModelPickerItem[] = [];
    for (const model of jumpModels) {
      if (getModelDisabledReason?.(model.instanceId, model.slug)) continue;
      if (!modelPickerJumpCommandForIndex(targets.length)) break;
      targets.push(model);
    }
    return targets;
  })();
  const modelJumpShortcutContext = {
    terminalFocus: false,
    terminalOpen: props.terminalOpen,
    modelPickerOpen: true,
  } as const;
  const modelJumpLabelByKey = ((): ReadonlyMap<string, string> => {
    if (jumpTargets.length === 0) return EMPTY_MODEL_JUMP_LABELS;
    const options = { platform: navigator.platform, context: modelJumpShortcutContext };
    const mapping = new Map<string, string>();
    jumpTargets.forEach((model, index) => {
      const command = modelPickerJumpCommandForIndex(index);
      const label = command ? shortcutLabelForCommand(keybindings, command, options) : null;
      if (label) mapping.set(providerModelKey(model.instanceId, model.slug), label);
    });
    return mapping.size > 0 ? mapping : EMPTY_MODEL_JUMP_LABELS;
  })();

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen()) return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: modelJumpShortcutContext,
      });
      if (command === "modelPicker.previousProvider" || command === "modelPicker.nextProvider") {
        event.preventDefault();
        event.stopPropagation();
        cycleProvider(command === "modelPicker.nextProvider" ? 1 : -1);
        return;
      }
      const jumpIndex = modelPickerJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) return;
      event.preventDefault();
      event.stopPropagation();
      const target = jumpTargets[jumpIndex];
      if (target) chooseModel(target);
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [chooseModel, cycleProvider, jumpTargets, keybindings, modelJumpShortcutContext]);

  // Typing anywhere in the menu — a provider row, a model row — goes to the
  // search field instead of the menu's type-ahead. Capture phase, so it runs
  // before the menu's own key handling on the focused row.
  const redirectTypingToSearch = (event: TypedKeyEvent) => {
    if (event.target === searchInputRef.current || !isTypedCharacter(event)) return;
    if (event.key === " " && !isSearching) return;
    event.preventDefault();
    event.stopPropagation();
    setSearchQuery((query) => query + event.key);
    focusSearchInput();
  };

  // When a swap removes the focused row, the menu parks focus on the popup
  // itself, outside this content's own capture; catch typing there too.
  useEffect(() => {
    const popup = contentRef.current?.closest<HTMLElement>('[data-slot="menu-popup"]');
    if (!popup) return;
    const onPopupKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.target === popup) redirectTypingToSearch(event);
    };
    popup.addEventListener("keydown", onPopupKeyDown, true);
    return () => popup.removeEventListener("keydown", onPopupKeyDown, true);
  }, [redirectTypingToSearch]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && searchQuery) {
      event.preventDefault();
      event.stopPropagation();
      setSearchQuery("");
      return;
    }
    if (event.key === "Escape" && providerMenuOpen) {
      event.preventDefault();
      event.stopPropagation();
      setProviderMenuOpen(false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const first = searchResults.find(
        (model) => !getModelDisabledReason?.(model.instanceId, model.slug),
      );
      if (first) chooseModel(first, event.shiftKey);
      return;
    }
    // Arrows, Escape (with nothing typed) and Tab drive the menu; everything
    // else edits the query and must not reach the menu's type-ahead.
    if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) {
      event.stopPropagation();
    }
  };

  // Models the manifest announces that an instance's installed CLI is too old
  // to run. A search spans every provider, so it explains gated matches from
  // any of them; a provider's list explains its own.
  const renderUpdateRequiredNotices = (entries: ReadonlyArray<ProviderInstanceEntry>) =>
    entries.flatMap((entry) => {
      const notice = formatProviderUpdateRequiredNotice(entry.snapshot, searchQuery);
      return notice
        ? [
            <div key={`update:${entry.instanceId}`} className="px-2 py-1.5 text-xs leading-snug">
              <p className="text-muted-foreground">{notice}</p>
              <MenuItem
                className={cn(ROW_CLASS, "mt-1 -mx-2")}
                onClick={() => {
                  props.onRequestClose?.();
                  void navigate({ to: "/settings/providers" });
                }}
              >
                Provider settings
              </MenuItem>
            </div>,
          ]
        : [];
    });

  const renderModelItem = (model: ModelPickerItem, showProvider: boolean) => {
    const modelKey = providerModelKey(model.instanceId, model.slug);
    const disabledReason = getModelDisabledReason?.(model.instanceId, model.slug) ?? null;
    const isFavorite = favoritesSet.has(modelKey);
    const isSelected = selectedModelKeySet.has(modelKey);
    const jumpLabel = modelJumpLabelByKey.get(modelKey);
    // Upstream retired its driver-keyed glyph table; the instance icon carries
    // the ACP registry art and accent the row's provider actually has.
    const providerEntry = showProvider ? entryByInstanceId.get(model.instanceId) : undefined;
    const providerLabel = model.subProvider
      ? `${model.instanceDisplayName} · ${model.subProvider}`
      : model.instanceDisplayName;
    const displayName = getDisplayModelName(
      model,
      props.lockedProvider === null ? { preferShortName: true } : undefined,
    );
    // The row's provider label, or the provider submenu it sits in, names the
    // provider already.
    const modelName = stripProviderName(displayName, {
      driverKind: model.driverKind,
      displayName: model.instanceDisplayName,
    });

    const label = (
      <>
        {providerEntry ? (
          <span className="shrink-0 text-muted-foreground" aria-hidden>
            {renderInstanceIcon(providerEntry)}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{modelName}</span>
        {showProvider ? (
          <span className="min-w-0 truncate font-normal text-muted-foreground/70">
            {providerLabel}
          </span>
        ) : null}
        {model.isUnavailable ? (
          <Badge variant="outline" size="sm">
            Unavailable
          </Badge>
        ) : null}
      </>
    );

    return (
      <MenuItem
        key={modelKey}
        disabled={Boolean(disabledReason)}
        // The host closes the menu on a pick, or keeps it open for what it
        // renders below the list.
        closeOnClick={false}
        className={cn(ROW_CLASS, "group", disabledReason && "data-disabled:pointer-events-auto")}
        onClick={(event) => chooseModel(model, event.shiftKey)}
      >
        {disabledReason ? (
          <Tooltip>
            <TooltipTrigger render={<span className="flex min-w-0 flex-1 items-center gap-2" />}>
              {label}
            </TooltipTrigger>
            <TooltipPopup side="left" align="center" className={TOOLTIP_CLASS}>
              {disabledReason}
            </TooltipPopup>
          </Tooltip>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2">{label}</span>
        )}
        <span className="flex shrink-0 items-center gap-1">
          {jumpLabel ? (
            <Kbd
              className={cn(
                "h-4 min-w-0 rounded-sm bg-foreground/4 px-1.5 text-[10px]",
                HOVER_REVEAL_CLASS,
              )}
            >
              {jumpLabel}
            </Kbd>
          ) : null}
          {/* Toggles the favorite without choosing the row: the item selects
              on click, so the star's click must not reach it. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            className={cn(
              "flex size-6 cursor-pointer items-center justify-center rounded-[4px] text-muted-foreground/70 hover:text-foreground",
              HOVER_REVEAL_CLASS,
              // No hover on touch: the star stays shown, or tapping a row's
              // right edge would toggle a favorite the user cannot see.
              "pointer-coarse:opacity-100",
            )}
            disabled={Boolean(disabledReason)}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void toggleFavorite(model.instanceId, model.slug);
            }}
          >
            <StarIcon className={cn("size-3.5", isFavorite && "fill-current text-yellow-500")} />
          </button>
          {isSelected ? (
            <CheckIcon className="size-4 shrink-0 text-foreground" aria-label="Selected" />
          ) : null}
        </span>
      </MenuItem>
    );
  };

  const renderInstanceIcon = (entry: ProviderInstanceEntry) => (
    <ProviderInstanceIcon
      driverKind={entry.driverKind}
      displayName={entry.displayName}
      accentColor={entry.accentColor}
      acpRegistryAgentId={entry.acpRegistryAgentId}
      acpRegistryIconUrl={entry.acpRegistryIconUrl}
      showBadge={shouldShowInstanceBadge(entry, instanceEntries)}
      className="size-4"
      iconClassName="size-4"
      indicatorBackground="var(--popover)"
      badgeClassName="right-[-0.25rem] bottom-[-0.25rem] h-3 min-w-3 px-0.5 text-[7px]"
    />
  );

  const favoritesIcon = <Heart weight="duotone" className="size-4 shrink-0" aria-hidden />;

  /** One of the provider menu's options. It sets the scope rather than
      choosing a model, so it never closes the menu. */
  const renderScopeOption = (input: {
    key: string;
    label: ReactNode;
    target: ModelPickerScope;
    disabled?: boolean;
    tooltip?: string;
    providerId: string;
  }) => (
    <MenuItem
      key={input.key}
      disabled={input.disabled}
      closeOnClick={false}
      data-model-picker-provider={input.providerId}
      className={cn(ROW_CLASS, input.disabled && "data-disabled:pointer-events-auto")}
      onClick={() => selectScope(input.target)}
    >
      {input.disabled && input.tooltip ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex min-w-0 flex-1 items-center gap-2" />}>
            {input.label}
          </TooltipTrigger>
          <TooltipPopup side="right" sideOffset={8} align="center" className={TOOLTIP_CLASS}>
            {input.tooltip}
          </TooltipPopup>
        </Tooltip>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">{input.label}</span>
      )}
      {scope === input.target ? (
        <CheckIcon className="size-4 shrink-0 text-foreground" aria-label="Selected" />
      ) : input.target === props.activeInstanceId ? (
        // Where the current model lives, when the list shows another scope.
        <span className="size-1.5 shrink-0 rounded-full bg-foreground/60" aria-label="Current" />
      ) : null}
    </MenuItem>
  );

  const renderProviderOption = (entry: ProviderInstanceEntry) => {
    const isUnavailable = !isProviderInstancePickerReady(entry);
    const isContextDisabled = !matchesLockedProvider(entry);
    const { current, legacy } = modelsForInstance(entry.instanceId);
    const needsSetup =
      props.onOpenProviderSetup !== undefined &&
      shouldOfferModelPickerSetup(entry, modelOptionsByInstance.get(entry.instanceId) ?? []);
    // An unready instance still opens when it holds the selected model or
    // can offer setup, so neither gets stranded behind a disabled option.
    const isDisabled =
      isContextDisabled ||
      (isUnavailable && current.length === 0 && legacy.length === 0 && !needsSetup);
    const tooltip = isContextDisabled
      ? `${entry.displayName} is unavailable in this thread. Start a new thread to switch providers.`
      : describeUnavailableInstance(entry);

    return renderScopeOption({
      key: entry.instanceId,
      providerId: entry.instanceId,
      target: entry.instanceId,
      disabled: isDisabled,
      tooltip,
      label: (
        <>
          {renderInstanceIcon(entry)}
          <span className="min-w-0 flex-1 truncate">{entry.displayName}</span>
        </>
      ),
    });
  };

  /** The provider menu: a submenu off a trigger naming the scope, opening on
      hover like any submenu. Its popup portals out of this content, so it
      carries the stamps itself: the picker's (focus, wheel lock), the
      composer's floating layer (or moving focus into it would read as leaving
      the composer and collapse it under the menu), and the corner hook on
      its wrapper. Controlled so choosing an option can close it without
      closing the menu. */
  const renderProviderMenu = () => (
    <MenuSub open={providerMenuOpen} onOpenChange={setProviderMenuOpen}>
      <MenuSubTrigger
        openOnHover
        data-model-picker-provider-trigger="true"
        className={cn(ROW_CLASS, "gap-2")}
      >
        {scopeEntry === "favorites" ? favoritesIcon : renderInstanceIcon(scopeEntry)}
        <span className="min-w-0 flex-1 truncate">
          {scopeEntry === "favorites" ? "Favorites" : scopeEntry.displayName}
        </span>
      </MenuSubTrigger>
      {/* The trigger sits 8px inside the menu (its 4px scroll padding plus this
          content's p-1), so a flush submenu lands on the menu's edge, worst
          when it flips to the left for lack of room. 12px clears it by 4px
          either way; -8px lines the first option up with the trigger. */}
      <MenuSubPopup
        sideOffset={12}
        alignOffset={-8}
        className="w-56"
        data-model-picker-content="true"
        {...composerFloatingLayerProps}
      >
        <div className="flex flex-col p-1" data-fork-model-picker="providers">
          {favoriteModels.length > 0
            ? renderScopeOption({
                key: "favorites",
                providerId: "favorites",
                target: "favorites",
                label: (
                  <>
                    {favoritesIcon}
                    <span className="min-w-0 flex-1 truncate">Favorites</span>
                  </>
                ),
              })
            : null}
          {providerEntries.map(renderProviderOption)}
        </div>
      </MenuSubPopup>
    </MenuSub>
  );

  const renderInstanceModels = (entry: ProviderInstanceEntry) => {
    const { instanceId } = entry;
    const { current, legacy } = modelsForInstance(instanceId);
    const needsSetup =
      props.onOpenProviderSetup !== undefined &&
      shouldOfferModelPickerSetup(entry, modelOptionsByInstance.get(instanceId) ?? []);
    return (
      <>
        {current.map((model) => renderModelItem(model, false))}
        {legacy.length > 0 ? (
          <MenuItem
            closeOnClick={false}
            aria-expanded={showLegacy}
            data-model-picker-legacy-toggle="true"
            className={cn(ROW_CLASS, "gap-2 text-muted-foreground")}
            onClick={() => setShowLegacy((shown) => !shown)}
          >
            <span className="min-w-0 flex-1 truncate">Legacy models</span>
            <span className="shrink-0 font-normal text-muted-foreground/70">{legacy.length}</span>
            <ChevronDownIcon
              className={cn("size-4 shrink-0 transition-transform", showLegacy && "rotate-180")}
              aria-hidden
            />
          </MenuItem>
        ) : null}
        {showLegacy ? legacy.map((model) => renderModelItem(model, false)) : null}
        {needsSetup ? (
          <div className="px-2 py-1.5 text-xs leading-snug">
            <p className="line-clamp-3 text-muted-foreground">
              {getProviderStatusMessage(entry.snapshot)}
            </p>
            <MenuItem
              className={cn(ROW_CLASS, "mt-1 -mx-2")}
              onClick={() => {
                props.onRequestClose?.();
                props.onOpenProviderSetup?.(instanceId);
              }}
            >
              Open provider setup
            </MenuItem>
          </div>
        ) : null}
        {current.length === 0 && legacy.length === 0 && !needsSetup ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">No models</p>
        ) : null}
        {renderUpdateRequiredNotices([entry])}
      </>
    );
  };

  const renderModelList = () => {
    if (isSearching) {
      return (
        <>
          {searchResults.length > 0 ? (
            searchResults.map((model) => renderModelItem(model, true))
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">No models found</p>
          )}
          {renderUpdateRequiredNotices(instanceEntries.filter(matchesLockedProvider))}
        </>
      );
    }
    if (scopeEntry === "favorites") {
      return favoriteModels.map((model) => renderModelItem(model, true));
    }
    return renderInstanceModels(scopeEntry);
  };

  return (
    <TooltipProvider delay={0}>
      <div
        ref={contentRef}
        className="flex min-h-0 flex-col gap-1 p-1"
        data-model-picker-content="true"
        data-fork-model-picker="true"
        onKeyDownCapture={redirectTypingToSearch}
      >
        {renderProviderMenu()}
        {/* Edge to edge: this content's p-1 plus the popup's 4px scroll padding. */}
        <MenuSeparator className="-mx-2" />
        <label className="flex h-8 shrink-0 items-center gap-2 rounded-[4px] border border-foreground/12 bg-foreground/4 px-2">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={searchInputRef}
            aria-label="Search models"
            placeholder="Search models"
            className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            onKeyDown={handleSearchKeyDown}
          />
        </label>
        {/* Scrolls on its own so whatever the host renders below stays put. */}
        <div className="flex max-h-80 min-h-0 flex-col overflow-y-auto">{renderModelList()}</div>
      </div>
    </TooltipProvider>
  );
});
