import type { ModelSelection } from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import { ComposerModelPicker } from "../ComposerModelPicker";
import { scheduledTaskModelWithOptions } from "./scheduledTaskModel.logic";

/** Share the composer's combined menu while persisting changes on the scheduled task. */
export function ScheduledTaskModelPicker({
  selection,
  prompt,
  onPromptChange,
  onSelectionChange,
  ...pickerProps
}: Omit<ComponentProps<typeof ComposerModelPicker>, "traitsInput"> & {
  readonly selection: ModelSelection | null;
  readonly prompt: string;
  readonly onPromptChange: (prompt: string) => void;
  readonly onSelectionChange: (selection: ModelSelection) => void;
}) {
  const instance = pickerProps.instanceEntries.find(
    (entry) => entry.instanceId === selection?.instanceId,
  );
  if (!selection || !instance) return <ProviderModelPicker {...pickerProps} combined />;
  return (
    <ComposerModelPicker
      {...pickerProps}
      traitsInput={{
        provider: instance.driverKind,
        instanceId: instance.instanceId,
        models: instance.models,
        model: selection.model,
        modelOptions: selection.options,
        prompt,
        onPromptChange,
        onModelOptionsChange: (options) =>
          onSelectionChange(scheduledTaskModelWithOptions(selection, options)),
        triggerLabelSeparator: " ",
        planModeEnabled: false,
        isComposerOwned: false,
      }}
    />
  );
}
