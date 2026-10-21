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

/**
 * The draft's pick while its provider instance is enabled for the task's
 * project, else the project default: a task saved with a provider the project
 * has turned off would fail at every launch (upstream #17879).
 */
export function scheduledTaskDraftSelection(
  draftSelection: ModelSelection | null,
  instanceEntries: ReadonlyArray<{
    readonly instanceId: ModelSelection["instanceId"];
    readonly enabled: boolean;
  }>,
  projectDefault: () => ModelSelection | null,
): ModelSelection | null {
  return draftSelection &&
    instanceEntries.some((entry) => entry.instanceId === draftSelection.instanceId && entry.enabled)
    ? draftSelection
    : projectDefault();
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
