/**
 * Fork shadow of upstream's ModelPickerContent — see
 * `.fork/customizations.yaml#fork-model-picker`.
 *
 * Same export, same props as upstream, so ProviderModelPicker's import is
 * untouched; the three exported helpers are upstream's verbatim. The render
 * is the fork's: a paged menu. ProviderModelPicker's shadow hosts this in a
 * Base UI Menu; the first page lists a search field, Favorites and one row per
 * provider instance, and clicking a row swaps the page for that provider's
 * models (legacy models one page deeper), led by a back row. Typing anywhere
 * lands in the search field, and a query swaps the page for one flat,
 * provider-agnostic list of matching models. Picking a model never closes the
 * menu from here; the host decides, since it may render more below the pages.
 */
import {
  ANTIGRAVITY_DEFAULT_MODEL,
  type ProviderInstanceId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { resolveSelectableModel } from "@t3tools/shared/model";
import { useAtomValue } from "@effect/atom-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Heart } from "@phosphor-icons/react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, StarIcon } from "lucide-react";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { getProviderStatusMessage, hasProviderSetup } from "./ProviderStatusBanner";
import { buildModelPickerSearchText, scoreModelPickerSearch } from "./modelPickerSearch";
import { getDisplayModelName, ModelEsque, PROVIDER_ICON_BY_PROVIDER } from "./providerIconUtils";
import { MenuItem, MenuSeparator } from "../ui/menu";
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
import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
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

/** Every page shares one row: 32px, 4px corners, 12px medium label. */
const ROW_CLASS = "h-8 min-h-8 rounded-[4px] px-2 py-0 text-xs font-medium sm:min-h-8 sm:text-xs";
/** Hidden at rest, shown while the row is hovered or keyboard-highlighted. */
const HOVER_REVEAL_CLASS =
  "opacity-0 transition-opacity group-hover:opacity-100 group-data-highlighted:opacity-100";

/** Which list the menu shows when no query is typed. */
type ModelPickerPage =
  | { readonly kind: "providers" }
  | { readonly kind: "favorites" }
  | { readonly kind: "models"; readonly instanceId: ProviderInstanceId; readonly legacy: boolean };

const PROVIDERS_PAGE: ModelPickerPage = { kind: "providers" };

function parentPage(page: ModelPickerPage): ModelPickerPage {
  return page.kind === "models" && page.legacy ? { ...page, legacy: false } : PROVIDERS_PAGE;
}

const TOOLTIP_CLASS = "max-w-64 text-balance font-normal leading-snug";

export const ModelPickerContent = memo(function ModelPickerContent(props: {
  /** The instance currently selected in the composer. */
  activeInstanceId: ProviderInstanceId;
  model: string;
  /**
   * When set, the picker is locked to the given driver kind — typically
   * because the user is editing a previously-sent message and can't change
   * which driver served the turn. Multiple instances of the same kind
   * remain selectable (e.g. locked to `codex` still lets the user switch
   * between the default Codex and a custom Codex Personal).
   */
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  /** All configured provider instances in display order, one root row each. */
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  /** Model options per instance, keyed by `ProviderInstanceId`. */
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
  } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState<ModelPickerPage>(PROVIDERS_PAGE);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const favorites = useClientSettings((s) => s.favorites ?? []);
  const serverKeybindings = useAtomValue(primaryServerKeybindingsAtom);
  const keybindings = providedKeybindings ?? serverKeybindings;
  const updateSettings = useUpdateClientSettings();

  const activeEntry = instanceEntries.find((entry) => entry.instanceId === props.activeInstanceId);
  const activeModel = resolveModelPickerSelectedModel({
    driverKind: activeEntry?.driverKind,
    model: props.model,
    options: modelOptionsByInstance.get(props.activeInstanceId) ?? [],
  });
  const activeModelSlug =
    activeModel?.slug ?? (props.model === ANTIGRAVITY_DEFAULT_MODEL ? "" : props.model);

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus({ preventScroll: true });
  }, []);

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
  const favoritesSet = useMemo(
    () => new Set(favorites.map((fav) => providerModelKey(fav.provider, fav.model))),
    [favorites],
  );
  const entryByInstanceId = useMemo(
    () => new Map(instanceEntries.map((entry) => [entry.instanceId, entry])),
    [instanceEntries],
  );
  const instanceOrder = useMemo(
    () => instanceEntries.map((entry) => entry.instanceId),
    [instanceEntries],
  );
  const matchesLockedProvider = useCallback(
    (entry: Pick<ProviderInstanceEntry, "driverKind" | "continuationGroupKey">): boolean => {
      if (props.lockedProvider === null) return true;
      if (entry.driverKind !== props.lockedProvider) return false;
      if (!props.lockedContinuationGroupKey) return true;
      return entry.continuationGroupKey === props.lockedContinuationGroupKey;
    },
    [props.lockedContinuationGroupKey, props.lockedProvider],
  );

  // One pass over the instance-keyed map; each model carries its instance id
  // and driver kind so a row renders its glyph without another lookup.
  const flatModels = useMemo(() => {
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
          ...(entry.continuationGroupKey
            ? { continuationGroupKey: entry.continuationGroupKey }
            : {}),
        });
      }
    }
    return out;
  }, [modelOptionsByInstance, entryByInstanceId, props.activeInstanceId, activeModelSlug]);

  const isSearching = searchQuery.trim().length > 0;

  // A query searches every provider's models (locked provider still
  // respected), ranked by match, favorites first on a tie.
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return flatModels
      .filter((model) => matchesLockedProvider(model))
      .map((model) => {
        const isFavorite = favoritesSet.has(providerModelKey(model.instanceId, model.slug));
        const fields = {
          name: model.name,
          ...(model.shortName ? { shortName: model.shortName } : {}),
          ...(model.subProvider ? { subProvider: model.subProvider } : {}),
          driverKind: model.driverKind,
          providerDisplayName: model.instanceDisplayName,
        };
        return {
          model,
          isFavorite,
          score: scoreModelPickerSearch({ ...fields, isFavorite }, searchQuery),
          tieBreaker: buildModelPickerSearchText(fields),
        };
      })
      .filter((ranked) => ranked.score !== null)
      .toSorted((a, b) => {
        const scoreDelta = (a.score ?? 0) - (b.score ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return a.tieBreaker.localeCompare(b.tieBreaker);
      })
      .map((ranked) => ranked.model);
  }, [favoritesSet, flatModels, isSearching, matchesLockedProvider, searchQuery]);

  const favoriteModels = useMemo(
    () =>
      sortProviderModelItems(
        flatModels.filter(
          (model) =>
            matchesLockedProvider(model) &&
            favoritesSet.has(providerModelKey(model.instanceId, model.slug)),
        ),
        { favoriteModelKeys: favoritesSet, groupFavorites: false, instanceOrder },
      ),
    [favoritesSet, flatModels, instanceOrder, matchesLockedProvider],
  );

  const modelsForInstance = useCallback(
    (instanceId: ProviderInstanceId) => {
      const models = sortProviderModelItems(
        flatModels.filter((model) => model.instanceId === instanceId),
        { favoriteModelKeys: favoritesSet, groupFavorites: true, instanceOrder: [] },
      );
      return {
        current: models.filter((model) => !model.isLegacy),
        legacy: models.filter((model) => model.isLegacy),
      };
    },
    [favoritesSet, flatModels],
  );

  const providerEntries = useMemo(() => {
    const visible = instanceEntries.filter(isProviderInstancePickerVisible);
    if (props.lockedProvider === null) return visible;
    // Locked: the thread's own providers first, the rest listed but disabled.
    return [
      ...visible.filter((entry) => matchesLockedProvider(entry)),
      ...visible.filter((entry) => !matchesLockedProvider(entry)),
    ];
  }, [instanceEntries, matchesLockedProvider, props.lockedProvider]);

  const handleModelSelect = useCallback(
    (modelSlug: string, instanceId: ProviderInstanceId) => {
      if (getModelDisabledReason?.(instanceId, modelSlug)) return;
      const options = modelOptionsByInstance.get(instanceId);
      const entry = entryByInstanceId.get(instanceId);
      if (!options || !entry) return;
      // `resolveSelectableModel` normalizes by driver kind; custom instances
      // share their driver's rules.
      const resolvedModel = resolveSelectableModel(entry.driverKind, modelSlug, options);
      if (resolvedModel) {
        onInstanceModelChange(instanceId, resolvedModel);
      }
    },
    [entryByInstanceId, getModelDisabledReason, modelOptionsByInstance, onInstanceModelChange],
  );

  // Swap first, focus later. Focusing the search field from the row's click
  // closes the menu: the row re-takes focus on click, and the field's focusout
  // is checked a microtask later against a row the swap already removed,
  // which the menu reads as focus leaving. A frame and a tick later, the swap
  // and that check have both run.
  const openPage = useCallback(
    (next: ModelPickerPage) => {
      setPage(next);
      window.requestAnimationFrame(focusSearchInput);
      window.setTimeout(focusSearchInput, 0);
    },
    [focusSearchInput],
  );

  // A pick from search results clears the query onto the model's own page,
  // so the menu (if the host keeps it open) shows the check on the new pick.
  const chooseModel = useCallback(
    (model: ModelPickerItem) => {
      handleModelSelect(model.slug, model.instanceId);
      if (!isSearching) return;
      setSearchQuery("");
      openPage({ kind: "models", instanceId: model.instanceId, legacy: model.isLegacy === true });
    },
    [handleModelSelect, isSearching, openPage],
  );

  const toggleFavorite = useCallback(
    (instanceId: ProviderInstanceId, model: string) => {
      const next = [...favorites];
      const index = next.findIndex((f) => f.provider === instanceId && f.model === model);
      if (index >= 0) {
        next.splice(index, 1);
      } else {
        next.push({ provider: instanceId, model });
      }
      updateSettings({ favorites: next });
    },
    [favorites, updateSettings],
  );

  // ⌘1–9 jump through the list the user is most likely choosing from: the
  // search results while searching, else the open page's models; the
  // providers page falls back to Favorites, else the active provider.
  const jumpModels = useMemo(() => {
    if (isSearching) return searchResults;
    if (page.kind === "favorites") return favoriteModels;
    if (page.kind === "models") {
      const { current, legacy } = modelsForInstance(page.instanceId);
      return page.legacy ? legacy : current;
    }
    if (favoriteModels.length > 0) return favoriteModels;
    return modelsForInstance(props.activeInstanceId).current;
  }, [favoriteModels, isSearching, modelsForInstance, page, props.activeInstanceId, searchResults]);
  const jumpTargets = useMemo(() => {
    const targets: ModelPickerItem[] = [];
    for (const model of jumpModels) {
      if (getModelDisabledReason?.(model.instanceId, model.slug)) continue;
      if (!modelPickerJumpCommandForIndex(targets.length)) break;
      targets.push(model);
    }
    return targets;
  }, [getModelDisabledReason, jumpModels]);
  const modelJumpShortcutContext = useMemo(
    () =>
      ({ terminalFocus: false, terminalOpen: props.terminalOpen, modelPickerOpen: true }) as const,
    [props.terminalOpen],
  );
  const modelJumpLabelByKey = useMemo((): ReadonlyMap<string, string> => {
    if (jumpTargets.length === 0) return EMPTY_MODEL_JUMP_LABELS;
    const options = { platform: navigator.platform, context: modelJumpShortcutContext };
    const mapping = new Map<string, string>();
    jumpTargets.forEach((model, index) => {
      const command = modelPickerJumpCommandForIndex(index);
      const label = command ? shortcutLabelForCommand(keybindings, command, options) : null;
      if (label) mapping.set(providerModelKey(model.instanceId, model.slug), label);
    });
    return mapping.size > 0 ? mapping : EMPTY_MODEL_JUMP_LABELS;
  }, [jumpTargets, keybindings, modelJumpShortcutContext]);

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen()) return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: modelJumpShortcutContext,
      });
      const jumpIndex = modelPickerJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) return;
      event.preventDefault();
      event.stopPropagation();
      const target = jumpTargets[jumpIndex];
      if (target) chooseModel(target);
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [chooseModel, jumpTargets, keybindings, modelJumpShortcutContext]);

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

  // When a page swap removes the focused row, the menu parks focus on the
  // popup itself, outside this content's own capture; catch typing there too.
  useEffect(() => {
    const popup = contentRef.current?.closest<HTMLElement>('[data-slot="menu-popup"]');
    if (!popup) return;
    const onPopupKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.target === popup) redirectTypingToSearch(event);
    };
    popup.addEventListener("keydown", onPopupKeyDown, true);
    return () => popup.removeEventListener("keydown", onPopupKeyDown, true);
  });

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && searchQuery) {
      event.preventDefault();
      event.stopPropagation();
      setSearchQuery("");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const first = searchResults.find(
        (model) => !getModelDisabledReason?.(model.instanceId, model.slug),
      );
      if (first) chooseModel(first);
      return;
    }
    // With nothing typed, Backspace and ArrowLeft step back a page.
    if (
      (event.key === "Backspace" || event.key === "ArrowLeft") &&
      !searchQuery &&
      page.kind !== "providers"
    ) {
      event.preventDefault();
      event.stopPropagation();
      openPage(parentPage(page));
      return;
    }
    // Arrows, Escape (with nothing typed) and Tab drive the menu; everything
    // else edits the query and must not reach the menu's type-ahead.
    if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) {
      event.stopPropagation();
    }
  };

  const renderModelItem = (model: ModelPickerItem, showProvider: boolean) => {
    const modelKey = providerModelKey(model.instanceId, model.slug);
    const disabledReason = getModelDisabledReason?.(model.instanceId, model.slug) ?? null;
    const isFavorite = favoritesSet.has(modelKey);
    const isSelected =
      model.instanceId === props.activeInstanceId && model.slug === activeModelSlug;
    const jumpLabel = modelJumpLabelByKey.get(modelKey);
    const ProviderIcon = showProvider
      ? (PROVIDER_ICON_BY_PROVIDER[model.driverKind] ?? null)
      : null;
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
        {ProviderIcon ? (
          <ProviderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
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
        // renders below the pages.
        closeOnClick={false}
        className={cn(ROW_CLASS, "group", disabledReason && "data-disabled:pointer-events-auto")}
        onClick={() => chooseModel(model)}
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
            )}
            disabled={Boolean(disabledReason)}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleFavorite(model.instanceId, model.slug);
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

  /** Leads every page past the first: the way back, titled with where you are. */
  const renderBackRow = (title: ReactNode) => (
    <>
      <MenuItem
        closeOnClick={false}
        data-model-picker-back="true"
        className={cn(ROW_CLASS, "gap-2")}
        onClick={() => openPage(parentPage(page))}
      >
        <ChevronLeftIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-1 items-center gap-2">{title}</span>
      </MenuItem>
      <MenuSeparator className="mx-0" />
    </>
  );

  /** A row that swaps the menu to another page rather than choosing anything. */
  const renderPageLink = (input: {
    key: string;
    label: ReactNode;
    target: ModelPickerPage;
    disabled?: boolean;
    tooltip?: string;
    trailing?: ReactNode;
    providerId: string;
  }) => (
    <MenuItem
      key={input.key}
      disabled={input.disabled}
      closeOnClick={false}
      data-model-picker-provider={input.providerId}
      data-model-picker-page-link="true"
      className={cn(ROW_CLASS, input.disabled && "data-disabled:pointer-events-auto")}
      onClick={() => openPage(input.target)}
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
      {input.trailing}
      {input.disabled ? null : (
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </MenuItem>
  );

  const renderInstanceIcon = (entry: ProviderInstanceEntry) => (
    <ProviderInstanceIcon
      driverKind={entry.driverKind}
      displayName={entry.displayName}
      accentColor={entry.accentColor}
      showBadge={shouldShowInstanceBadge(entry, instanceEntries)}
      className="size-4"
      iconClassName="size-4"
      indicatorBackground="var(--popover)"
      badgeClassName="right-[-0.25rem] bottom-[-0.25rem] h-3 min-w-3 px-0.5 text-[7px]"
    />
  );

  const renderProviderRow = (entry: ProviderInstanceEntry) => {
    const isUnavailable = !isProviderInstancePickerReady(entry);
    const isContextDisabled = !matchesLockedProvider(entry);
    const { current, legacy } = modelsForInstance(entry.instanceId);
    const needsSetup =
      props.onOpenProviderSetup !== undefined &&
      shouldOfferModelPickerSetup(entry, modelOptionsByInstance.get(entry.instanceId) ?? []);
    // An unready instance still opens when it holds the selected model or
    // can offer setup, so neither gets stranded behind a disabled row.
    const isDisabled =
      isContextDisabled ||
      (isUnavailable && current.length === 0 && legacy.length === 0 && !needsSetup);
    const tooltip = isContextDisabled
      ? `${entry.displayName} is unavailable in this thread. Start a new thread to switch providers.`
      : describeUnavailableInstance(entry);

    return renderPageLink({
      key: entry.instanceId,
      providerId: entry.instanceId,
      target: { kind: "models", instanceId: entry.instanceId, legacy: false },
      disabled: isDisabled,
      tooltip,
      label: (
        <>
          {renderInstanceIcon(entry)}
          <span className="min-w-0 flex-1 truncate">{entry.displayName}</span>
        </>
      ),
      trailing:
        entry.instanceId === props.activeInstanceId ? (
          <span className="size-1.5 shrink-0 rounded-full bg-foreground/60" aria-label="Current" />
        ) : null,
    });
  };

  const renderModelsPage = (instanceId: ProviderInstanceId, showLegacy: boolean) => {
    const entry = entryByInstanceId.get(instanceId);
    if (!entry) return null;
    const { current, legacy } = modelsForInstance(instanceId);
    if (showLegacy) {
      return (
        <>
          {renderBackRow(<span className="min-w-0 flex-1 truncate">Legacy models</span>)}
          {legacy.map((model) => renderModelItem(model, false))}
        </>
      );
    }
    const needsSetup =
      props.onOpenProviderSetup !== undefined &&
      shouldOfferModelPickerSetup(entry, modelOptionsByInstance.get(instanceId) ?? []);
    return (
      <>
        {renderBackRow(
          <>
            {renderInstanceIcon(entry)}
            <span className="min-w-0 flex-1 truncate">{entry.displayName}</span>
          </>,
        )}
        {current.map((model) => renderModelItem(model, false))}
        {legacy.length > 0
          ? renderPageLink({
              key: "legacy",
              providerId: `${instanceId}:legacy`,
              target: { kind: "models", instanceId, legacy: true },
              label: <span className="min-w-0 flex-1 truncate">Legacy models</span>,
              trailing: (
                <span className="shrink-0 font-normal text-muted-foreground/70">
                  {legacy.length}
                </span>
              ),
            })
          : null}
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
      </>
    );
  };

  const favoritesIcon = <Heart weight="duotone" className="size-4 shrink-0" aria-hidden />;

  const renderPage = () => {
    if (isSearching) {
      return searchResults.length > 0 ? (
        searchResults.map((model) => renderModelItem(model, true))
      ) : (
        <p className="px-2 py-2 text-xs text-muted-foreground">No models found</p>
      );
    }
    if (page.kind === "models") return renderModelsPage(page.instanceId, page.legacy);
    if (page.kind === "favorites") {
      return (
        <>
          {renderBackRow(
            <>
              {favoritesIcon}
              <span className="min-w-0 flex-1 truncate">Favorites</span>
            </>,
          )}
          {favoriteModels.map((model) => renderModelItem(model, true))}
        </>
      );
    }
    return (
      <>
        {favoriteModels.length > 0
          ? renderPageLink({
              key: "favorites",
              providerId: "favorites",
              target: { kind: "favorites" },
              label: (
                <>
                  {favoritesIcon}
                  <span className="min-w-0 flex-1 truncate">Favorites</span>
                </>
              ),
            })
          : null}
        {providerEntries.map(renderProviderRow)}
      </>
    );
  };

  // Rows keep the keys the old submenus answered to: ArrowRight opens a
  // row's page, ArrowLeft steps back. The search field handles its own.
  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target === searchInputRef.current || !(event.target instanceof HTMLElement)) return;
    if (event.key === "ArrowLeft" && page.kind !== "providers") {
      event.preventDefault();
      openPage(parentPage(page));
    } else if (event.key === "ArrowRight") {
      const link = event.target.closest<HTMLElement>("[data-model-picker-page-link]");
      if (!link) return;
      event.preventDefault();
      link.click();
    }
  };

  return (
    <TooltipProvider delay={0}>
      <div
        ref={contentRef}
        className="flex min-h-0 flex-col gap-1 p-1"
        data-model-picker-content="true"
        data-fork-model-picker="true"
        onKeyDownCapture={redirectTypingToSearch}
        onKeyDown={handleRowKeyDown}
      >
        <label className="flex h-8 shrink-0 items-center gap-2 rounded-[4px] border border-foreground/12 bg-foreground/4 px-2">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={searchInputRef}
            aria-label="Search models"
            placeholder="Search models"
            className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </label>
        {/* Scrolls on its own so whatever the host renders below stays put. */}
        <div className="flex max-h-80 min-h-0 flex-col overflow-y-auto">{renderPage()}</div>
      </div>
    </TooltipProvider>
  );
});
