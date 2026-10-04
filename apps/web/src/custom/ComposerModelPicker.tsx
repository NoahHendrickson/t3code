/**
 * The composer's single model-and-reasoning menu — see
 * `.fork/customizations.yaml#fork-model-picker`.
 *
 * Wraps ProviderModelPicker and hands it the reasoning half: a panel under
 * the model pages where effort is a slider over the model's own levels, and
 * every other trait keeps a compact control (a checkbox for on/off traits,
 * segments for the rest). The trigger reads "Opus 5.5 High". Writes go to the
 * same draft-store options, with the same Ultrathink prompt prefix, as
 * upstream's traits picker, which the composer no longer renders beside it.
 */
import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import {
  applyClaudePromptEffortPrefix,
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
} from "@t3tools/shared/model";
import { Slider } from "@base-ui/react/slider";
import { type ComponentProps, type KeyboardEvent, type ReactNode, useState } from "react";

// Through the alias: a relative import type-checks against upstream's module,
// not the shadow that adds `traits` and `combined`.
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import { Checkbox } from "../components/ui/checkbox";
import { useComposerDraftStore } from "../composerDraftStore";
import { cn } from "~/lib/utils";
import {
  type ComposerModelTraits,
  type ComposerModelTraitsInput,
  type SelectDescriptor,
  effortStopIndex,
  orderTraitRows,
  resolveComposerModelTraits,
} from "./composerModelTraits";

const ULTRATHINK_PROMPT_PREFIX = "Ultrathink:\n";
/**
 * The thumb's width (w-5). Edge alignment keeps its centre half of this inside
 * the track, so the stops inset by the same amount to sit under it.
 */
const THUMB_WIDTH_PX = 20;

function replaceDescriptorCurrentValue(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
  descriptorId: string,
  currentValue: string | boolean,
): ReadonlyArray<ProviderOptionDescriptor> {
  return descriptors.map((descriptor) =>
    descriptor.id !== descriptorId
      ? descriptor
      : descriptor.type === "boolean"
        ? { ...descriptor, ...(typeof currentValue === "boolean" ? { currentValue } : {}) }
        : { ...descriptor, ...(typeof currentValue === "string" ? { currentValue } : {}) },
  );
}

/**
 * The slider, checkboxes and segments read their own keys. Escape and Tab
 * still reach the menu, so it can close and move focus.
 */
function keepKeysInPanel(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
}

/** A labelled row; as a `<label>`, a click anywhere on it toggles its checkbox. */
function TraitRow(props: { label: string; children: ReactNode; asLabel?: boolean }) {
  const Row = props.asLabel ? "label" : "div";
  return (
    <Row
      className={cn(
        "flex min-h-8 items-center justify-between gap-3 px-2",
        props.asLabel && "cursor-pointer",
      )}
    >
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{props.label}</span>
      {props.children}
    </Row>
  );
}

function EffortSlider(props: {
  descriptor: SelectDescriptor;
  committedIndex: number;
  disabled: boolean;
  onCommit: (optionId: string) => void;
}) {
  const { descriptor, committedIndex } = props;
  // Dragging previews locally and writes once on release, so sweeping past
  // Ultrathink doesn't rewrite the prompt at every stop.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const index = dragIndex ?? committedIndex;
  const option = descriptor.options[index];
  const lastIndex = descriptor.options.length - 1;

  return (
    <div className="flex flex-col gap-1.5 px-2 pt-1.5 pb-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-muted-foreground">{descriptor.label}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {option?.isDefault ? <span className="text-muted-foreground">Default</span> : null}
          <span className="truncate font-medium text-foreground">{option?.label}</span>
        </span>
      </div>
      <Slider.Root
        value={index}
        min={0}
        max={lastIndex}
        step={1}
        thumbAlignment="edge"
        disabled={props.disabled}
        onValueChange={(value) => setDragIndex(value)}
        onValueCommitted={(value) => {
          setDragIndex(null);
          const next = descriptor.options[value];
          if (next && value !== committedIndex) props.onCommit(next.id);
        }}
      >
        <Slider.Control className="flex h-6 w-full touch-none items-center select-none data-disabled:opacity-64">
          {/* A 24px bar with a block thumb of the same height. The fill runs
              from the start to the thumb's centre; the stops are dots, and the
              model's default level is a short bar. */}
          <Slider.Track className="relative h-6 w-full rounded-[6px] bg-foreground/8">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 rounded-s-[6px] bg-foreground/16"
              style={{
                width: `calc(${THUMB_WIDTH_PX / 2}px + ${index / lastIndex} * (100% - ${THUMB_WIDTH_PX}px))`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-y-0"
              style={{ insetInline: THUMB_WIDTH_PX / 2 }}
            >
              {descriptor.options.map((stop, stopIndex) => (
                <span
                  key={stop.id}
                  className={cn(
                    "absolute top-1/2 -translate-1/2 rounded-full",
                    stop.isDefault ? "h-2.5 w-0.5" : "size-1",
                    stopIndex <= index ? "bg-foreground/50" : "bg-foreground/35",
                  )}
                  style={{ left: `${(stopIndex / lastIndex) * 100}%` }}
                />
              ))}
            </div>
            <Slider.Thumb
              aria-label={descriptor.label}
              getAriaValueText={() => option?.label ?? ""}
              className="h-6 w-5 rounded-[6px] bg-background shadow-sm dark:bg-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  );
}

/** Styled like ui/toggle-group's segmented variant, so Glass's --input wash applies. */
function SegmentedTrait(props: {
  descriptor: SelectDescriptor;
  onSelect: (optionId: string) => void;
}) {
  const current = getProviderOptionCurrentValue(props.descriptor);
  return (
    <div className="flex min-w-0 flex-wrap justify-end gap-0.5 rounded-[6px] bg-input/40 p-0.5">
      {props.descriptor.options.map((option) => {
        const selected = option.id === current;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            className={cn(
              "h-6 cursor-pointer rounded-[4px] px-2 text-xs font-medium text-muted-foreground hover:text-foreground",
              selected && "bg-background text-foreground shadow-xs/10 dark:bg-input/72",
            )}
            onClick={() => props.onSelect(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ComposerModelTraitsPanel(props: {
  input: ComposerModelTraitsInput;
  traits: NonNullable<ComposerModelTraits>;
}) {
  const { input, traits } = props;
  const { descriptors, effortDescriptor, primarySelectId } = traits;
  const setProviderModelOptions = useComposerDraftStore((store) => store.setProviderModelOptions);

  const updateDescriptors = (next: ReadonlyArray<ProviderOptionDescriptor>) => {
    const target = input.threadRef ?? input.draftId;
    if (!target) return;
    setProviderModelOptions(
      target,
      input.provider,
      buildProviderOptionSelectionsFromDescriptors(next),
      {
        ...(input.instanceId ? { instanceId: input.instanceId } : {}),
        model: input.model,
        persistSticky: true,
      },
    );
  };

  // Upstream's select semantics: Ultrathink is a prompt prefix, not a stored
  // option, and leaving it strips the prefix again.
  const selectOption = (descriptor: SelectDescriptor, value: string) => {
    if (descriptor.promptInjectedValues?.includes(value)) {
      input.onPromptChange(
        input.prompt.trim().length === 0
          ? ULTRATHINK_PROMPT_PREFIX
          : applyClaudePromptEffortPrefix(input.prompt, "ultrathink"),
      );
      return;
    }
    const isPrimary = descriptor.id === primarySelectId;
    if (traits.ultrathinkInBodyText && isPrimary) return;
    if (traits.ultrathinkPromptControlled && isPrimary) {
      input.onPromptChange(input.prompt.replace(/^Ultrathink:\s*/i, ""));
    }
    updateDescriptors(replaceDescriptorCurrentValue(descriptors, descriptor.id, value));
  };

  if (traits.modelIsUnavailable) {
    return (
      <div className="flex flex-col p-1" onKeyDown={keepKeysInPanel}>
        {orderTraitRows(descriptors, null).map((descriptor) => {
          const value = getProviderOptionCurrentLabel(descriptor);
          return value ? (
            <TraitRow key={descriptor.id} label={descriptor.label}>
              <span className="truncate text-xs text-muted-foreground">{value}</span>
            </TraitRow>
          ) : null;
        })}
      </div>
    );
  }

  const effortLocked = traits.ultrathinkInBodyText && effortDescriptor?.id === primarySelectId;

  return (
    <div className="flex flex-col p-1" data-fork-model-traits="true" onKeyDown={keepKeysInPanel}>
      {effortDescriptor ? (
        <>
          <EffortSlider
            descriptor={effortDescriptor}
            committedIndex={effortStopIndex(
              effortDescriptor,
              traits.ultrathinkPromptControlled && effortDescriptor.id === primarySelectId,
            )}
            disabled={effortLocked}
            onCommit={(optionId) => selectOption(effortDescriptor, optionId)}
          />
          {effortLocked ? (
            <p className="px-2 pb-1.5 text-xs text-muted-foreground">
              Your prompt contains &quot;ultrathink&quot; in the text. Remove it to change this
              option.
            </p>
          ) : null}
        </>
      ) : null}
      {orderTraitRows(descriptors, effortDescriptor).map((descriptor) => {
        if (descriptor.type === "boolean") {
          return (
            <TraitRow key={descriptor.id} label={descriptor.label} asLabel>
              <Checkbox
                checked={descriptor.currentValue === true}
                onCheckedChange={(checked) =>
                  updateDescriptors(
                    replaceDescriptorCurrentValue(descriptors, descriptor.id, checked),
                  )
                }
              />
            </TraitRow>
          );
        }
        return (
          <TraitRow key={descriptor.id} label={descriptor.label}>
            <SegmentedTrait
              descriptor={descriptor}
              onSelect={(optionId) => selectOption(descriptor, optionId)}
            />
          </TraitRow>
        );
      })}
    </div>
  );
}

/** The composer's model picker, carrying the reasoning controls the traits picker used to. */
export function ComposerModelPicker({
  traitsInput,
  ...pickerProps
}: Omit<ComponentProps<typeof ProviderModelPicker>, "traits" | "combined"> & {
  traitsInput: ComposerModelTraitsInput;
}) {
  const traits = resolveComposerModelTraits(traitsInput);
  return (
    <ProviderModelPicker
      {...pickerProps}
      combined
      {...(traits
        ? {
            traits: {
              label: traits.trigger.label,
              speedIcon: traits.trigger.speedIcon,
              panel: <ComposerModelTraitsPanel input={traitsInput} traits={traits} />,
            },
          }
        : {})}
    />
  );
}
