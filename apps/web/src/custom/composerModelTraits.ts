/**
 * Resolves the composer's model traits for the fork's combined model menu —
 * see `.fork/customizations.yaml#fork-model-picker`.
 *
 * Mirrors upstream's TraitsMenuContent selection (same capabilities, same
 * implicit fast-mode default, same Ultrathink detection) so the menu's
 * reasoning half reads and writes exactly what the traits picker did.
 */
import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import {
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
  isClaudeUltrathinkPrompt,
  normalizeModelSlug,
} from "@t3tools/shared/model";

import {
  buildTraitsTriggerDisplay,
  buildUnavailableModelOptionDescriptors,
} from "../components/chat/TraitsPicker";
import {
  type renderProviderTraitsPicker,
  withImplicitFastModeDefault,
} from "../components/chat/composerProviderState";
import { getProviderModelCapabilities } from "../providerModels";

/** The composer's traits input, as it already hands to the traits picker. */
export type ComposerModelTraitsInput = Parameters<typeof renderProviderTraitsPicker>[0];

export type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

/** Each provider's name for its reasoning-effort option. */
const EFFORT_DESCRIPTOR_IDS: ReadonlySet<string> = new Set([
  "effort",
  "reasoningEffort",
  "reasoning",
  "variant",
]);

/** The option the slider drives: an effort select with at least two levels to slide between. */
export function findEffortDescriptor(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
): SelectDescriptor | null {
  return (
    descriptors.find(
      (descriptor): descriptor is SelectDescriptor =>
        descriptor.type === "select" &&
        EFFORT_DESCRIPTOR_IDS.has(descriptor.id) &&
        descriptor.options.length > 1,
    ) ?? null
  );
}

/**
 * Rows under the slider keep one order whatever the provider lists: the rest
 * in the provider's order, then Fast Mode, then Context Window last.
 */
const TRAIT_ROW_RANK: Readonly<Record<string, number>> = { fastMode: 1, contextWindow: 2 };

export function orderTraitRows(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
  effortDescriptor: SelectDescriptor | null,
): ReadonlyArray<ProviderOptionDescriptor> {
  return descriptors
    .filter((descriptor) => descriptor !== effortDescriptor)
    .toSorted((a, b) => (TRAIT_ROW_RANK[a.id] ?? 0) - (TRAIT_ROW_RANK[b.id] ?? 0));
}

/** The slider stop for the effort in force; a prompt-injected Ultrathink outranks the stored value. */
export function effortStopIndex(descriptor: SelectDescriptor, ultrathinkActive: boolean): number {
  const value = ultrathinkActive ? "ultrathink" : getProviderOptionCurrentValue(descriptor);
  const index = descriptor.options.findIndex((option) => option.id === value);
  if (index >= 0) return index;
  return Math.max(
    0,
    descriptor.options.findIndex((option) => option.isDefault),
  );
}

export type ComposerModelTraits = ReturnType<typeof resolveComposerModelTraits>;

/** Null when the model has nothing to configure or the composer has no draft to write to. */
export function resolveComposerModelTraits(input: ComposerModelTraitsInput) {
  const { provider, model, models, prompt, planModeEnabled } = input;
  if (input.threadRef === undefined && input.draftId === undefined) return null;

  const caps = getProviderModelCapabilities(models, model, provider, planModeEnabled);
  const modelOptions = withImplicitFastModeDefault(caps, input.modelOptions);
  // OpenCode keeps a model's saved options even when its catalog drops it;
  // they show read-only.
  const modelIsUnavailable =
    provider === "opencode" &&
    !models.some((candidate) => candidate.slug === normalizeModelSlug(model, provider));
  const descriptors = modelIsUnavailable
    ? buildUnavailableModelOptionDescriptors(
        planModeEnabled
          ? modelOptions
          : modelOptions?.filter((option) => option.id !== "agent" || option.value !== "plan"),
      )
    : getProviderOptionDescriptors({ caps, selections: modelOptions });
  if (descriptors.length === 0) return null;

  // Upstream ties Ultrathink to the first select, whatever its id.
  const primarySelect =
    descriptors.find(
      (descriptor): descriptor is SelectDescriptor => descriptor.type === "select",
    ) ?? null;
  const ultrathinkPromptControlled =
    (primarySelect?.promptInjectedValues?.length ?? 0) > 0 && isClaudeUltrathinkPrompt(prompt);
  const ultrathinkInBodyText =
    ultrathinkPromptControlled && isClaudeUltrathinkPrompt(prompt.replace(/^Ultrathink:\s*/i, ""));

  return {
    descriptors,
    primarySelectId: primarySelect?.id ?? null,
    effortDescriptor: modelIsUnavailable ? null : findEffortDescriptor(descriptors),
    ultrathinkPromptControlled,
    ultrathinkInBodyText,
    modelIsUnavailable,
    trigger: buildTraitsTriggerDisplay({
      provider,
      descriptors,
      primarySelectDescriptorId: primarySelect?.id ?? null,
      ultrathinkPromptControlled,
      labelSeparator: " ",
    }),
  };
}
