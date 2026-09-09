/**
 * Manual project sort should start from the list on screen.
 *
 * `projectOrder` is only written by drag reorder (or leftover from an earlier
 * manual session). Switching the setting to "manual" without seeding it jumps
 * the headers to that stored / default array instead of the updated_at or
 * created_at order the user was looking at.
 */
import { useUiStateStore } from "../uiStateStore";

export function physicalProjectOrderFromVisibleGroups(
  groups: ReadonlyArray<{
    readonly memberProjects: ReadonlyArray<{ readonly physicalProjectKey: string }>;
  }>,
): string[] {
  return groups.flatMap((group) => group.memberProjects.map((member) => member.physicalProjectKey));
}

function sameProjectOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** Freeze the current visual project list as the manual order. */
export function snapshotVisibleProjectOrderAsManual(
  groups: ReadonlyArray<{
    readonly memberProjects: ReadonlyArray<{ readonly physicalProjectKey: string }>;
  }>,
): void {
  const projectOrder = physicalProjectOrderFromVisibleGroups(groups);
  if (projectOrder.length === 0) return;
  useUiStateStore.setState((state) =>
    sameProjectOrder(state.projectOrder, projectOrder) ? state : { ...state, projectOrder },
  );
}
