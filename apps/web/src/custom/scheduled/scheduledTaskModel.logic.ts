import type { ModelSelection } from "@t3tools/contracts";

/** Keep task-specific options only while the selected model and provider instance still match. */
export function scheduledTaskModelSelection(
  selected: ModelSelection | null,
  saved: ModelSelection | null,
): ModelSelection | null {
  return selected && saved?.instanceId === selected.instanceId && saved.model === selected.model
    ? saved
    : selected;
}

/** Replacing options also supports clearing them without restoring the previously saved effort. */
export function scheduledTaskModelWithOptions(
  selection: ModelSelection,
  options: ModelSelection["options"],
): ModelSelection {
  return {
    instanceId: selection.instanceId,
    model: selection.model,
    ...(options ? { options } : {}),
  };
}
