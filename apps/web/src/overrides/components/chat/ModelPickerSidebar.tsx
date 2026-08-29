/**
 * Fork shadow of upstream's ModelPickerSidebar — see
 * `.fork/customizations.yaml#fork-model-picker`.
 *
 * Same export, same props, same imports as upstream (relative, so a sync
 * diffs cleanly — see overrides/README.md). Upstream renders the provider
 * rail as a vertical 44px column down the picker's left edge; Figma t3-fork
 * 342:8038 lays the same entries out as a horizontal segmented tab strip
 * across the top — favorites first, then one 32px tab per configured
 * instance, with the selected tab lifted on a lighter fill. Everything the
 * rail did (favorites entry, disabled/unavailable tooltips, the "new"
 * sparkle, custom-instance initials) still happens here; only the geometry
 * changed. The strip has far less room than the rail had (about six tabs in
 * the 256px popup), so it scrolls, keeps the selected tab in view and fades
 * whichever edge has more. The tabs are plain toggle buttons (aria-pressed),
 * not ARIA tabs: nothing here is a tabpanel and the combobox below owns the
 * arrow keys, so the tab pattern would promise a contract it cannot keep.
 */
import { type ProviderInstanceId } from "@t3tools/contracts";
import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Heart } from "@phosphor-icons/react";
import { SparklesIcon } from "lucide-react";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import {
  isProviderInstancePickerReady,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../../providerInstances";

/**
 * Build the hover tooltip for an instance button. Mirrors the old
 * kind-based copy but uses the entry's configured `displayName` so custom
 * instances get their user-authored name (e.g. "Codex Personal — Unavailable.").
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

const TAB_CLASS =
  "relative isolate flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-foreground transition-colors hover:bg-foreground/8 focus-visible:bg-foreground/8 focus-visible:outline-none";
const SELECTED_TAB_CLASS = "border-border/60 bg-foreground/16 hover:bg-foreground/16";
const NEW_BADGE_CLASS =
  "pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex size-3.5 items-center justify-center rounded-full bg-transparent text-update-foreground shadow-sm";
/** Edge fades for an overflowing strip; the scrollbar is hidden, so these are the affordance. */
const STRIP_FADE_START_CLASS = "[mask-image:linear-gradient(to_right,transparent,black_1.25rem)]";
const STRIP_FADE_END_CLASS =
  "[mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]";
const STRIP_FADE_BOTH_CLASS =
  "[mask-image:linear-gradient(to_right,transparent,black_1.25rem,black_calc(100%-1.25rem),transparent)]";

const PICKER_TOOLTIP_SIDE = "bottom" as const;
const PICKER_TOOLTIP_SIDE_OFFSET = 6;
const PICKER_TOOLTIP_CLASS = "max-w-64 text-balance font-normal leading-snug";

export const ModelPickerSidebar = memo(function ModelPickerSidebar(props: {
  selectedInstanceId: ProviderInstanceId | "favorites";
  onSelectInstance: (instanceId: ProviderInstanceId | "favorites") => void;
  /**
   * Instance entries to render as tabs. Each entry becomes one icon keyed by
   * `instanceId`, so the default built-in Codex and a user-authored
   * `codex_personal` appear as two distinct tabs, each routing to their own
   * model list.
   */
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  /** Render the favorites tab. Hidden for locked-provider instance switching. */
  showFavorites?: boolean;
  /** Instance ids shown in the strip but unavailable for the current picker context. */
  disabledInstanceIds?: ReadonlySet<ProviderInstanceId>;
  getDisabledInstanceTooltip?: (entry: ProviderInstanceEntry) => string;
  /**
   * Instance id values that should render the "new" sparkle badge. Callers
   * pass the subset of default built-in ids they want flagged (custom
   * instances are never flagged — the user just made them).
   */
  newBadgeInstanceIds?: ReadonlySet<ProviderInstanceId>;
}) {
  const handleSelect = (instanceId: ProviderInstanceId | "favorites") => {
    props.onSelectInstance(instanceId);
  };
  const showFavorites = props.showFavorites ?? true;
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });
  const updateOverflow = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const start = strip.scrollLeft > 1;
    const end = maxScrollLeft - strip.scrollLeft > 1;
    setOverflow((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    const selected = Array.from(
      strip.querySelectorAll<HTMLElement>("[data-model-picker-provider]"),
    ).find((tab) => tab.dataset.modelPickerProvider === props.selectedInstanceId);
    if (selected) {
      const stripRect = strip.getBoundingClientRect();
      const tabRect = selected.getBoundingClientRect();
      if (tabRect.left < stripRect.left) {
        strip.scrollLeft += tabRect.left - stripRect.left;
      } else if (tabRect.right > stripRect.right) {
        strip.scrollLeft += tabRect.right - stripRect.right;
      }
    }
    updateOverflow();
  }, [props.instanceEntries, props.selectedInstanceId, showFavorites, updateOverflow]);

  return (
    <div
      ref={stripRef}
      data-model-picker-sidebar="true"
      className={cn(
        "flex min-w-0 shrink items-center overflow-x-auto overflow-y-hidden rounded-lg bg-foreground/8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        overflow.start && overflow.end && STRIP_FADE_BOTH_CLASS,
        overflow.start && !overflow.end && STRIP_FADE_START_CLASS,
        !overflow.start && overflow.end && STRIP_FADE_END_CLASS,
      )}
      onScroll={updateOverflow}
    >
      {showFavorites ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                aria-pressed={props.selectedInstanceId === "favorites"}
                data-model-picker-provider="favorites"
                className={cn(
                  TAB_CLASS,
                  props.selectedInstanceId === "favorites" && SELECTED_TAB_CLASS,
                )}
                onClick={() => handleSelect("favorites")}
                type="button"
                aria-label="Favorites"
              >
                <Heart weight="duotone" className="size-4 shrink-0" aria-hidden />
              </button>
            }
          />
          <TooltipPopup
            side={PICKER_TOOLTIP_SIDE}
            sideOffset={PICKER_TOOLTIP_SIDE_OFFSET}
            align="center"
            className={PICKER_TOOLTIP_CLASS}
          >
            Favorites
          </TooltipPopup>
        </Tooltip>
      ) : null}

      {props.instanceEntries.map((entry) => {
        const isUnavailable = !isProviderInstancePickerReady(entry);
        const isContextDisabled = props.disabledInstanceIds?.has(entry.instanceId) ?? false;
        const isDisabled = isUnavailable || isContextDisabled;
        const isSelected = props.selectedInstanceId === entry.instanceId;
        const showNewBadge = props.newBadgeInstanceIds?.has(entry.instanceId) ?? false;
        const showInstanceBadge = shouldShowInstanceBadge(entry, props.instanceEntries);

        const tooltip = isUnavailable
          ? describeUnavailableInstance(entry)
          : isContextDisabled
            ? (props.getDisabledInstanceTooltip?.(entry) ?? entry.displayName)
            : showNewBadge
              ? `${entry.displayName} — New`
              : entry.displayName;

        const button = (
          <button
            aria-pressed={isSelected}
            data-model-picker-provider={entry.instanceId}
            data-provider-accent-color={entry.accentColor}
            className={cn(
              TAB_CLASS,
              isSelected && SELECTED_TAB_CLASS,
              isDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
            onClick={() => !isDisabled && handleSelect(entry.instanceId)}
            disabled={isDisabled}
            type="button"
            aria-label={
              isDisabled ? tooltip : showNewBadge ? `${entry.displayName}, new` : entry.displayName
            }
          >
            <ProviderInstanceIcon
              driverKind={entry.driverKind}
              displayName={entry.displayName}
              accentColor={entry.accentColor}
              showBadge={showInstanceBadge}
              className="size-4"
              iconClassName="size-4"
              indicatorBackground="var(--popover)"
              badgeClassName="right-[-0.25rem] bottom-[-0.25rem] h-3 min-w-3 px-0.5 text-[7px]"
            />
            {showNewBadge ? (
              <span className={NEW_BADGE_CLASS} aria-hidden>
                <SparklesIcon className="size-2" />
              </span>
            ) : null}
          </button>
        );

        // Disabled buttons do not fire pointer events, so the tooltip anchors
        // to a wrapper that still does.
        const trigger = isDisabled ? (
          <span className="relative block shrink-0">{button}</span>
        ) : (
          button
        );

        return (
          <Tooltip key={entry.instanceId}>
            <TooltipTrigger render={trigger} />
            <TooltipPopup
              side={PICKER_TOOLTIP_SIDE}
              sideOffset={PICKER_TOOLTIP_SIDE_OFFSET}
              align="center"
              className={PICKER_TOOLTIP_CLASS}
            >
              {tooltip}
            </TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
});
