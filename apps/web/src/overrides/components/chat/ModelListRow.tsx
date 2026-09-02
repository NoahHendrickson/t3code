/**
 * Fork shadow of upstream's ModelListRow — see
 * `.fork/customizations.yaml#fork-model-picker`.
 *
 * Same export, same props, same imports as upstream (relative, so a sync
 * diffs cleanly — see overrides/README.md). Figma t3-fork 342:8038 draws
 * each model as one 32px line: the name, and a check on the selected row.
 * Upstream's two-line row (name over a provider footer) plus an always-
 * visible star and jump badge collapses onto that line: where rows mix
 * providers (favorites, search) the footer becomes a leading glyph and the
 * instance name inline after the model — the glyph alone is per driver, so
 * two Codex accounts would be indistinguishable — and the star and jump
 * badge surface on hover or keyboard highlight so favoriting and the
 * shortcut hint stay reachable without crowding the resting row.
 */
import { type ProviderDriverKind, type ProviderInstanceId } from "@t3tools/contracts";
import { memo } from "react";
import { CheckIcon, StarIcon } from "lucide-react";
import {
  getDisplayModelName,
  getTriggerDisplayModelLabel,
  type ModelEsque,
  PROVIDER_ICON_BY_PROVIDER,
} from "./providerIconUtils";
import { ComboboxItem } from "../ui/combobox";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Kbd } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { modelPickerModelKey } from "./modelPickerKeys";

/** Hidden at rest, shown while the row is hovered or keyboard-highlighted. */
const HOVER_REVEAL_CLASS =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-data-highlighted:opacity-100";

export const ModelListRow = memo(function ModelListRow(props: {
  index: number;
  model: ModelEsque;
  /** Instance the model belongs to — the routing key used in combobox values. */
  instanceId: ProviderInstanceId;
  /** Driver kind of the instance — used for the provider icon glyph. */
  driverKind: ProviderDriverKind;
  /**
   * Display name shown inline after the model on mixed-provider rows.
   * Usually the instance's configured `displayName` so custom instances
   * like "Codex Personal" render with their user-authored label.
   */
  providerDisplayName: string;
  providerAccentColor?: string | undefined;
  isFavorite: boolean;
  isSelected: boolean;
  showProvider: boolean;
  preferShortName?: boolean;
  useTriggerLabel?: boolean;
  showNewBadge?: boolean;
  unavailable?: boolean;
  jumpLabel?: string | null;
  disabledReason?: string | null;
  onToggleFavorite: () => void;
}) {
  const ProviderIcon = PROVIDER_ICON_BY_PROVIDER[props.driverKind] ?? null;
  const providerLabel = props.model.subProvider
    ? `${props.providerDisplayName} · ${props.model.subProvider}`
    : props.providerDisplayName;

  const row = (
    <ComboboxItem
      hideIndicator
      index={props.index}
      value={modelPickerModelKey(props.instanceId, props.model.slug)}
      disabled={Boolean(props.disabledReason)}
      contentClassName="flex w-full items-center gap-2"
      className={cn(
        "group relative h-8 min-h-8 w-full !min-w-0 max-w-full cursor-pointer rounded-md px-2 py-0 transition-[background-color,box-shadow,color] sm:min-h-8",
        "hover:bg-[color-mix(in_srgb,var(--popover)_90%,var(--contrast-foreground))] data-highlighted:bg-[color-mix(in_srgb,var(--popover)_90%,var(--contrast-foreground))] data-selected:bg-transparent data-selected:text-foreground data-selected:ring-0 [&[data-highlighted][data-selected]]:bg-[color-mix(in_srgb,var(--popover)_90%,var(--contrast-foreground))]",
        props.disabledReason &&
          "data-disabled:pointer-events-auto data-disabled:cursor-not-allowed data-disabled:hover:bg-transparent",
      )}
    >
      {props.showProvider && ProviderIcon ? (
        <ProviderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
      <span
        className={cn(
          "min-w-0 truncate text-left text-xs font-medium leading-none",
          !props.showProvider && "flex-1",
        )}
      >
        {props.useTriggerLabel
          ? getTriggerDisplayModelLabel(props.model)
          : getDisplayModelName(
              props.model,
              props.preferShortName ? { preferShortName: true } : undefined,
            )}
      </span>
      {props.showProvider ? (
        <span className="min-w-0 flex-1 truncate text-left text-xs font-normal leading-none text-muted-foreground/70">
          {providerLabel}
        </span>
      ) : null}
      {props.showNewBadge ? (
        <span
          className="shrink-0 rounded border border-update/35 bg-update/15 px-0.5 py-px text-[10px] font-bold uppercase leading-none tracking-wide text-update-foreground"
          aria-label="New model"
        >
          New
        </span>
      ) : null}
      {props.unavailable ? (
        <Badge variant="outline" size="sm">
          Unavailable
        </Badge>
      ) : null}

      <span className="flex shrink-0 items-center gap-1">
        {props.jumpLabel ? (
          <Kbd
            className={cn(
              "h-4 min-w-0 rounded-sm bg-foreground/4 px-1.5 text-[10px]",
              HOVER_REVEAL_CLASS,
            )}
          >
            {props.jumpLabel}
          </Kbd>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                className={cn(
                  "size-6 shrink-0 text-muted-foreground/70 hover:text-foreground",
                  props.isFavorite ? "text-foreground" : HOVER_REVEAL_CLASS,
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onToggleFavorite();
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                }}
                disabled={Boolean(props.disabledReason)}
                aria-label={props.isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <StarIcon
                  className={cn("size-3.5", props.isFavorite && "fill-current text-yellow-500")}
                />
              </Button>
            }
          />
          <TooltipPopup side="top" align="center">
            {props.isFavorite ? "Remove from favorites" : "Add to favorites"}
          </TooltipPopup>
        </Tooltip>
        {props.isSelected ? (
          <CheckIcon className="size-4 shrink-0 text-foreground" aria-label="Selected" />
        ) : null}
      </span>
    </ComboboxItem>
  );

  if (!props.disabledReason) {
    return row;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipPopup side="left" align="center" className="max-w-64 text-balance leading-snug">
        {props.disabledReason}
      </TooltipPopup>
    </Tooltip>
  );
});
