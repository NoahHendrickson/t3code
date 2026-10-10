/**
 * Fork shadow of upstream's ProviderModelPicker — see
 * `.fork/customizations.yaml#fork-model-picker`.
 *
 * Upstream's file with three changes. The Popover shell becomes a Base UI
 * Menu, so the picker can page — providers first, then a provider's models
 * (ModelPickerContent's shadow renders the pages). Non-modal like the popover
 * it replaces; upstream's own wheel/touch lock below still guards the page.
 * The trigger label drops the provider name ("Opus 5.5", not "Claude Opus
 * 5.5"). The composer's trigger hides the provider icon too, except where its
 * label collapses; Settings keeps it. And an optional `traits` slot (the
 * composer's ComposerModelPicker fills it) adds the reasoning label to the
 * trigger and its panel under the pages, keeping the menu open on a pick.
 *
 * The `compact` prop (dropped upstream in #11002, since restored) caps the
 * trigger's width from the fork's footer (custom/composerModelSlotCompact.ts)
 * instead of letting the composer's controls layout size it; the fork keeps
 * the max width on the composer's trigger too, where upstream lifts it.
 */
import {
  ANTIGRAVITY_DEFAULT_MODEL,
  type ProviderInstanceId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "../ui/badge";
import { Menu, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { stripProviderName } from "~/custom/modelPickerDisplayName";
import { ModelPickerContent, resolveModelPickerSelectedModel } from "./ModelPickerContent";
import { ChatGptSharingControl } from "./ChatGptSharingControl";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import {
  ModelEsque,
  getTriggerDisplayModelLabel,
  getTriggerDisplayModelName,
} from "./providerIconUtils";
import { shouldShowInstanceBadge, type ProviderInstanceEntry } from "../../providerInstances";
import {
  ComposerControl,
  ComposerControlChevron,
  type ComposerControlSize,
} from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";
import { shortcutLabelForCommand } from "../../keybindings";

export const ProviderModelPicker = memo(function ProviderModelPicker(props: {
  /**
   * The instance currently selected in the composer. Drives the trigger
   * icon, label and the default-highlighted combobox row.
   */
  activeInstanceId: ProviderInstanceId;
  model: string;
  selectedModels?: ReadonlyArray<{ instanceId: ProviderInstanceId; model: string }>;
  onToggleModel?: (instanceId: ProviderInstanceId, model: string) => void;
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  /** Instance entries rendered in the sidebar + used to resolve display name. */
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  activeProviderIconClassName?: string;
  instanceIndicatorBackground?: string;
  size?: ComposerControlSize;
  /** Fork-only (see the header): the composer's narrow-footer width cap. */
  compact?: boolean;
  isComposerOwned?: boolean;
  disabled?: boolean;
  terminalOpen?: boolean;
  open?: boolean;
  triggerClassName?: string;
  /** Aggregate settings can show a neutral value without claiming one provider is selected. */
  triggerLabel?: string;
  triggerAriaLabel?: string;
  onOpenChange?: (open: boolean) => void;
  onOpenProviderSetup?: (instanceId: ProviderInstanceId) => void;
  getModelDisabledReason?: (instanceId: ProviderInstanceId, model: string) => string | null;
  onInstanceModelChange: (instanceId: ProviderInstanceId, model: string) => void;
  /** The selected model's reasoning: a trigger label plus a panel under the model pages. */
  traits?: { label: string; panel: ReactNode };
  /**
   * The composer's combined menu: a pick keeps it open (effort usually
   * follows a new model) at one width, whether or not the model has traits.
   */
  combined?: boolean;
}) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const [uncontrolledIsMenuOpen, setUncontrolledIsMenuOpen] = useState(false);
  const isMenuOpen = props.open ?? uncontrolledIsMenuOpen;
  const size = props.size ?? "sm";

  // Resolve the active instance entry by exact routing key. The composer
  // resolves fallbacks before rendering this component; if the selected
  // instance disappears, do not infer a replacement from its driver kind.
  const activeEntry = useMemo(() => {
    return (
      props.instanceEntries.find((entry) => entry.instanceId === props.activeInstanceId) ?? null
    );
  }, [props.activeInstanceId, props.instanceEntries]);

  const activeInstanceId = props.activeInstanceId;
  const selectedInstanceOptions = props.modelOptionsByInstance.get(activeInstanceId) ?? [];
  // Account-specific catalogs must keep the selected model label while unavailable.
  const selectedModel =
    resolveModelPickerSelectedModel({
      driverKind: activeEntry?.driverKind,
      model: props.model,
      options: selectedInstanceOptions,
    }) ??
    (activeEntry?.driverKind === "opencode" || activeEntry?.driverKind === "antigravity"
      ? undefined
      : selectedInstanceOptions[0]);
  // The provider name is dropped here; the tooltip keeps the full model name
  // and names the provider instance.
  const triggerTitle = selectedModel
    ? activeEntry
      ? stripProviderName(getTriggerDisplayModelName(selectedModel), activeEntry)
      : getTriggerDisplayModelName(selectedModel)
    : props.model === ANTIGRAVITY_DEFAULT_MODEL
      ? "Choose model"
      : props.model || "Choose model";
  const triggerLabel = selectedModel
    ? `${getTriggerDisplayModelLabel(selectedModel)}${selectedModel.isUnavailable ? " (Unavailable)" : ""}`
    : triggerTitle;
  const showInstanceBadge =
    activeEntry !== null && shouldShowInstanceBadge(activeEntry, props.instanceEntries);

  const floatingLayerProps = props.isComposerOwned ? composerFloatingLayerProps : {};

  const setIsMenuOpen = (open: boolean) => {
    props.onOpenChange?.(open);
    if (props.open === undefined) {
      setUncontrolledIsMenuOpen(open);
    }
  };

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const { documentElement, body } = document;
    const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    documentElement.style.overscrollBehavior = "contain";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const shouldAllowOverlayScroll = (target: EventTarget | null) => {
      return target instanceof Element && target.closest("[data-model-picker-content]");
    };
    const preventBackgroundWheel = (event: WheelEvent) => {
      if (shouldAllowOverlayScroll(event.target)) {
        return;
      }
      event.preventDefault();
    };
    const preventBackgroundTouchMove = (event: TouchEvent) => {
      if (shouldAllowOverlayScroll(event.target)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("wheel", preventBackgroundWheel, { capture: true, passive: false });
    document.addEventListener("touchmove", preventBackgroundTouchMove, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener("wheel", preventBackgroundWheel, { capture: true });
      document.removeEventListener("touchmove", preventBackgroundTouchMove, { capture: true });
      documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [isMenuOpen]);

  const handleInstanceModelChange = (instanceId: ProviderInstanceId, model: string) => {
    if (props.disabled) return;
    props.onInstanceModelChange(instanceId, model);
    if (!props.combined) setIsMenuOpen(false);
  };

  const shortcutLabel = props.keybindings
    ? shortcutLabelForCommand(props.keybindings, "modelPicker.toggle")
    : null;
  const selectedEntries = props.selectedModels?.map((selection) => {
    const entry = props.instanceEntries.find(
      (candidate) => candidate.instanceId === selection.instanceId,
    );
    const model = resolveModelPickerSelectedModel({
      driverKind: entry?.driverKind,
      model: selection.model,
      options: props.modelOptionsByInstance.get(selection.instanceId) ?? [],
    });
    // Same provider-name strip as the single trigger title; the tooltip
    // keeps the full names.
    const modelName = model
      ? entry
        ? stripProviderName(getTriggerDisplayModelName(model), entry)
        : getTriggerDisplayModelName(model)
      : selection.model;
    return {
      ...selection,
      entry,
      label: model ? `${modelName}${model.isUnavailable ? " (Unavailable)" : ""}` : modelName,
      fullLabel: model
        ? `${getTriggerDisplayModelName(model)}${model.isUnavailable ? " (Unavailable)" : ""}`
        : selection.model,
    };
  });
  const multipleLabel = selectedEntries
    ? selectedEntries.length === 0
      ? "Choose models"
      : `${selectedEntries
          .slice(0, 2)
          .map((selection) => selection.label)
          .join(", ")}${selectedEntries.length > 2 ? `, ${selectedEntries.length - 2} more` : ""}`
    : undefined;
  const allModelNames = selectedEntries
    ? selectedEntries.map((selection) => selection.fullLabel).join(", ") || "Choose models"
    : undefined;
  const triggerTooltipContent = shortcutLabel
    ? `${props.triggerLabel ?? allModelNames ?? triggerLabel} · ${shortcutLabel}`
    : (props.triggerLabel ?? allModelNames ?? triggerLabel);
  // The composer shows the model name alone. Its resting strip (size xs)
  // collapses that name to nothing below 640px, so the icon comes back there
  // rather than leave a bare chevron.
  const composerIconClassName =
    props.isComposerOwned &&
    (size === "xs" ? "hidden @max-[640px]/composer-surface:inline-flex" : "hidden");

  return (
    <Menu
      modal={false}
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          setIsMenuOpen(false);
          return;
        }
        setIsMenuOpen(open);
      }}
    >
      <MenuTrigger
        render={
          <ComposerControl
            aria-label={props.triggerAriaLabel ?? allModelNames}
            size={size}
            data-chat-provider-model-picker="true"
            // Effort lives in this menu, so Mod+Shift+E opens it like upstream's TraitsPicker.
            data-composer-shortcut={
              props.isComposerOwned && props.traits ? "composer.effort" : undefined
            }
            className={cn(
              "min-w-0 justify-between whitespace-nowrap",
              props.compact ? "max-w-42 shrink-0" : "max-w-48 shrink sm:max-w-56",
              props.triggerClassName,
            )}
            disabled={props.disabled}
          />
        }
      >
        <span
          className={cn("flex min-w-0 flex-1 items-center", size === "xs" ? "gap-1" : "gap-1.5")}
        >
          {/* An aggregate label claims no provider; several selected models
              stack their glyphs (hidden in the composer like the single icon). */}
          {props.triggerLabel !== undefined ? null : selectedEntries ? (
            <span
              className={cn("flex shrink-0 items-center -space-x-1", composerIconClassName)}
              aria-hidden="true"
            >
              {selectedEntries
                .slice(0, 3)
                .map((selection) =>
                  selection.entry ? (
                    <ProviderInstanceIcon
                      key={`${selection.instanceId}:${selection.model}`}
                      driverKind={selection.entry.driverKind}
                      displayName={selection.entry.displayName}
                      accentColor={selection.entry.accentColor}
                      className="size-4 rounded-full bg-(--chat-composer-glass-surface,var(--background)) ring-2 ring-(--chat-composer-glass-surface,var(--background))"
                      iconClassName="size-4"
                    />
                  ) : null,
                )}
              {selectedEntries.length > 3 ? (
                <span className="relative z-30 flex size-4 items-center justify-center rounded-full bg-(--chat-composer-glass-surface,var(--background)) text-3xs ring-2 ring-(--chat-composer-glass-surface,var(--background))">
                  +{selectedEntries.length - 3}
                </span>
              ) : null}
            </span>
          ) : (
            <>
              {activeEntry ? (
                <ProviderInstanceIcon
                  driverKind={activeEntry.driverKind}
                  displayName={activeEntry.displayName}
                  accentColor={activeEntry.accentColor}
                  acpRegistryAgentId={activeEntry.acpRegistryAgentId}
                  acpRegistryIconUrl={activeEntry.acpRegistryIconUrl}
                  showBadge={showInstanceBadge}
                  className={cn("size-4", composerIconClassName)}
                  iconClassName={cn("size-4", props.activeProviderIconClassName)}
                  indicatorBackground={props.instanceIndicatorBackground ?? "var(--contrast-input)"}
                  badgeClassName={cn(
                    "right-[-0.125rem] bottom-[-0.125rem] h-3 min-w-3 px-0.5 text-5xs",
                    size === "xs" && "shadow-none",
                  )}
                />
              ) : null}
            </>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="min-w-0 flex-1 overflow-hidden truncate"
                  data-chat-provider-model-picker-label="true"
                />
              }
            >
              {props.triggerLabel ?? multipleLabel ?? triggerTitle}
            </TooltipTrigger>
            <TooltipPopup side="top">
              {triggerTooltipContent}
              {/* The composer hides the provider icon, so the tooltip names
                  the instance serving the model. */}
              {activeEntry ? (
                <span className="block text-muted-foreground">{activeEntry.displayName}</span>
              ) : null}
            </TooltipPopup>
          </Tooltip>
          {selectedModel?.isUnavailable && !selectedEntries && props.triggerLabel === undefined ? (
            <Badge variant="outline" size="sm">
              Unavailable
            </Badge>
          ) : null}
          {/* The resting strip (size xs) sizes this trigger down to its icon
              below 640px, so the traits label collapses there with the model
              name. Elsewhere it truncates rather than spill past the trigger's
              max width. Fast mode is part of the label text (upstream #16069). */}
          {props.traits?.label ? (
            <span
              className={cn(
                "min-w-0 truncate text-muted-foreground",
                size === "xs" && "@max-[640px]/composer-surface:hidden",
              )}
              data-chat-provider-model-picker-traits="true"
            >
              {props.traits.label}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="flex items-center">
          <ComposerControlChevron size={size} />
        </span>
      </MenuTrigger>
      {/* The composer's trigger ends the row, so its right edge holds still
          while the label's length changes; anchor the menu there. It always
          opens above and never flips: paging to a taller provider would
          otherwise move it to the other side mid-pick (the draft composer
          sits mid-screen), so a short space scrolls the menu instead. */}
      <MenuPopup
        {...floatingLayerProps}
        align={props.isComposerOwned ? "end" : "start"}
        {...(props.isComposerOwned
          ? { side: "top" as const, collisionAvoidance: { side: "none" as const } }
          : {})}
        className={props.combined ? "w-64" : "w-56"}
      >
        <ModelPickerContent
          activeInstanceId={activeInstanceId}
          model={props.model}
          {...(props.selectedModels !== undefined ? { selectedModels: props.selectedModels } : {})}
          {...(props.onToggleModel
            ? {
                onToggleModel: (instanceId: ProviderInstanceId, model: string) => {
                  if (!props.disabled) props.onToggleModel?.(instanceId, model);
                },
              }
            : {})}
          lockedProvider={props.lockedProvider}
          lockedContinuationGroupKey={props.lockedContinuationGroupKey ?? null}
          instanceEntries={props.instanceEntries}
          {...(props.keybindings ? { keybindings: props.keybindings } : {})}
          modelOptionsByInstance={props.modelOptionsByInstance}
          terminalOpen={props.terminalOpen ?? false}
          onRequestClose={() => setIsMenuOpen(false)}
          {...(props.onOpenProviderSetup ? { onOpenProviderSetup: props.onOpenProviderSetup } : {})}
          {...(props.getModelDisabledReason
            ? { getModelDisabledReason: props.getModelDisabledReason }
            : {})}
          onInstanceModelChange={handleInstanceModelChange}
        />
        {props.traits ? (
          <>
            {/* Edge to edge: the popup's scroll wrapper pads its children by
                4px, so the rule pulls back out by the same amount. It ends at
                the wrapper's padding box, so nothing scrolls sideways. */}
            <MenuSeparator className="-mx-1 my-0" />
            {/* Stamped like the pages above, so the wheel lock lets the popup
                scroll from here and modelPickerHoldsFocus counts the panel's
                controls as inside the picker. */}
            <div data-model-picker-content="true">{props.traits.panel}</div>
          </>
        ) : null}
        {props.selectedModels === undefined ? (
          <ChatGptSharingControl provider={activeEntry?.snapshot ?? null} />
        ) : null}
      </MenuPopup>
    </Menu>
  );
});
