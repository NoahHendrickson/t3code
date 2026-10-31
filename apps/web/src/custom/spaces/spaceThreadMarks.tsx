/**
 * How Spaces draws a thread outside the sidebar's cards — see
 * `.fork/customizations.yaml#fork-spaces`: its provider mark and its card's
 * status, for the tab row and the Home overview alike.
 */
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";

import { resolveThreadLastVisitedAt } from "~/components/Sidebar.logic";
import type { useThreadShellsForProjectRefs } from "~/state/entities";
import { useEnvironmentProviders } from "~/state/environments";
import { useUiStateStore } from "~/uiStateStore";

import { resolveSidebarV2CardStatus } from "../sidebarV2CardStatus";
import { SidebarV2StatusMark } from "../SidebarV2StatusIndicator";

export type ThreadShell = ReturnType<typeof useThreadShellsForProjectRefs>[number];

/** The provider a thread runs on, for its mark: its instance resolved to a
    driver, falling back to the instance id, which a default instance shares
    with its driver. */
export function useThreadProvider() {
  const providersByEnvironment = useEnvironmentProviders();
  return (shell: ThreadShell) => {
    const instanceId = shell.runtime?.providerInstanceId ?? shell.modelSelection.instanceId;
    const provider = providersByEnvironment
      .get(shell.environmentId)
      ?.find((entry) => entry.instanceId === instanceId);
    return {
      driverKind: provider?.driver ?? instanceId,
      displayName: provider?.displayName ?? instanceId,
    };
  };
}

/** A thread's status as its card resolves it, from the device's own visit
    watermark for it and the time to judge a wake at. */
export function threadCardStatus(
  shell: ThreadShell,
  localLastVisitedAt: string | undefined,
  now: string,
) {
  return resolveSidebarV2CardStatus(shell, {
    lastVisitedAt: resolveThreadLastVisitedAt(shell.lastVisitedAt, localLastVisitedAt),
    wokeAt: threadWokeAt(shell, { now }),
  });
}

/** A thread's status as its card draws it: the same ladder, read state and
    wake, in the cards' 14px slot. */
export function ThreadStatusMark(props: { readonly shell: ThreadShell }) {
  const { shell } = props;
  const key = scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id));
  const localLastVisitedAt = useUiStateStore((store) => store.threadLastVisitedAtById[key]);
  return (
    <span className="flex h-[14px] shrink-0 items-center">
      <SidebarV2StatusMark
        status={threadCardStatus(shell, localLastVisitedAt, new Date().toISOString()).topStatus}
        seed={key}
        idle="dot"
      />
    </span>
  );
}
