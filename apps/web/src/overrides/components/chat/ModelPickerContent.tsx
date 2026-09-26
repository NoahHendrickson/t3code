/**
 * Fork shadow of upstream's ModelPickerContent — see
 * `.fork/customizations.yaml#fork-model-picker`.
 *
 * Same export, same props as upstream, so ProviderModelPicker's import is
 * untouched; the three exported helpers are upstream's verbatim. The render
 * is the fork's: a cascade menu. ProviderModelPicker's shadow hosts this in a
 * Base UI Menu; the root lists a search field, Favorites and one row per
 * provider instance, and each row opens that provider's models in a submenu on
 * hover (legacy models one level deeper). Typing anywhere in the cascade lands
 * in the search field, and a query swaps the providers for one flat,
 * provider-agnostic list of matching models.
 */
import {
  ANTIGRAVITY_DEFAULT_MODEL,
  type ProviderInstanceId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { resolveSelectableModel } from "@t3tools/shared/model";
import { useAtomValue } from "@effect/atom-react";
import {
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Heart } from "@phosphor-icons/react";
import { CheckIcon, SearchIcon, StarIcon } from "lucide-react";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { getProviderStatusMessage, hasProviderSetup } from "./ProviderStatusBanner";
import { buildModelPickerSearchText, scoreModelPickerSearch } from "./modelPickerSearch";
import { getDisplayModelName, ModelEsque, PROVIDER_ICON_BY_PROVIDER } from "./providerIconUtils";
import { MenuItem, MenuSub, MenuSubPopup, MenuSubTrigger } from "../ui/menu";
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
import { ModelPickerFloatingLayerContext } from "~/custom/modelPickerFloatingLayer";
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
  badge?: "new";
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
function isTypedCharacter(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

const EMPTY_MODEL_JUMP_LABELS = new Map<string, string>();

/** Every level of the cascade shares one row: 32px, 4px corners, 12px medium label. */
const ROW_CLASS =
  "h-8 min-h-8 rounded-[4px] px-2 py-0 text-xs font-medium sm:min-h-8 sm:text-xs data-popup-open:bg-accent";
/** Hidden at rest, shown while the row is hovered or keyboard-highlighted. */
const HOVER_REVEAL_CLASS =
  "opacity-0 transition-opacity group-hover:opacity-100 group-data-highlighted:opacity-100";
const SUBMENU_CLASS = "w-64";
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
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  const floatingLayerProps = useContext(ModelPickerFloatingLayerContext);

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
          ...(model.badge ? { badge: model.badge } : {}),
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
  // search results while searching, else Favorites, else the active provider.
  const jumpModels = useMemo(() => {
    if (isSearching) return searchResults;
    if (favoriteModels.length > 0) return favoriteModels;
    return modelsForInstance(props.activeInstanceId).current;
  }, [favoriteModels, isSearching, modelsForInstance, props.activeInstanceId, searchResults]);
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
      if (target) handleModelSelect(target.slug, target.instanceId);
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [handleModelSelect, jumpTargets, keybindings, modelJumpShortcutContext]);

  // Typing anywhere in the cascade — a provider row, an open submenu — goes to
  // the search field instead of the menu's type-ahead. Capture phase, so it
  // runs before the menu's own key handling on the focused row.
  const redirectTypingToSearch = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target === searchInputRef.current || !isTypedCharacter(event)) return;
    if (event.key === " " && !isSearching) return;
    event.preventDefault();
    event.stopPropagation();
    setSearchQuery((query) => query + event.key);
    focusSearchInput();
  };

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
      if (first) handleModelSelect(first.slug, first.instanceId);
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
        {/* Sits against the name it qualifies, as a quiet tint rather than a chip. */}
        {model.badge === "new" ? (
          <span
            className="shrink-0 rounded-[4px] bg-update/12 px-1 py-0.5 text-[10px] font-medium leading-none text-update-foreground"
            aria-label="New model"
          >
            New
          </span>
        ) : null}
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
        className={cn(ROW_CLASS, "group", disabledReason && "data-disabled:pointer-events-auto")}
        onClick={() => handleModelSelect(model.slug, model.instanceId)}
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

  const renderSubmenu = (trigger: ReactNode, body: ReactNode, disabled = false) => (
    <MenuSub>
      {trigger}
      {disabled ? null : (
        <MenuSubPopup className={SUBMENU_CLASS} sideOffset={8} {...floatingLayerProps}>
          <div data-model-picker-content="true" data-fork-model-picker="true">
            {body}
          </div>
        </MenuSubPopup>
      )}
    </MenuSub>
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

    const label = (
      <>
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
        <span className="min-w-0 flex-1 truncate">{entry.displayName}</span>
        {entry.instanceId === props.activeInstanceId ? (
          <span className="size-1.5 shrink-0 rounded-full bg-foreground/60" aria-label="Current" />
        ) : null}
      </>
    );

    const trigger = (
      <MenuSubTrigger
        disabled={isDisabled}
        data-model-picker-provider={entry.instanceId}
        className={cn(ROW_CLASS, isDisabled && "data-disabled:pointer-events-auto")}
      >
        {isDisabled ? (
          <Tooltip>
            <TooltipTrigger render={<span className="flex min-w-0 flex-1 items-center gap-2" />}>
              {label}
            </TooltipTrigger>
            <TooltipPopup side="right" sideOffset={8} align="center" className={TOOLTIP_CLASS}>
              {tooltip}
            </TooltipPopup>
          </Tooltip>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2">{label}</span>
        )}
      </MenuSubTrigger>
    );

    const body = (
      <>
        {current.map((model) => renderModelItem(model, false))}
        {legacy.length > 0
          ? renderSubmenu(
              <MenuSubTrigger className={ROW_CLASS}>
                <span className="min-w-0 flex-1 truncate">Legacy models</span>
                <span className="shrink-0 font-normal text-muted-foreground/70">
                  {legacy.length}
                </span>
              </MenuSubTrigger>,
              legacy.map((model) => renderModelItem(model, false)),
            )
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
                props.onOpenProviderSetup?.(entry.instanceId);
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

    return <Fragment key={entry.instanceId}>{renderSubmenu(trigger, body, isDisabled)}</Fragment>;
  };

  return (
    <TooltipProvider delay={0}>
      <div
        className="flex flex-col gap-1 p-1"
        data-model-picker-content="true"
        data-fork-model-picker="true"
        onKeyDownCapture={redirectTypingToSearch}
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

        {isSearching ? (
          searchResults.length > 0 ? (
            <div className="flex flex-col">
              {searchResults.map((model) => renderModelItem(model, true))}
            </div>
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">No models found</p>
          )
        ) : (
          <div className="flex flex-col">
            {favoriteModels.length > 0
              ? renderSubmenu(
                  <MenuSubTrigger data-model-picker-provider="favorites" className={ROW_CLASS}>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <Heart weight="duotone" className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">Favorites</span>
                    </span>
                  </MenuSubTrigger>,
                  favoriteModels.map((model) => renderModelItem(model, true)),
                )
              : null}
            {providerEntries.map(renderProviderRow)}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
});
