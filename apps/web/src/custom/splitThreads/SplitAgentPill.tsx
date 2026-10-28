/**
 * The pill in the composer's context row — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * Alone, "Split agent" opens a new draft on this thread's project, worktree
 * and branch in a pane beside it. In a split the same spot reads "Pop out",
 * which dissolves the pair and leaves this thread on screen alone.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { useRef, type MouseEvent, type PointerEvent } from "react";

import { Button } from "~/components/ui/button";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";

import { NavigationArrowIcon } from "../icons/lucide-phosphor";
import { useSplitPane, type SplitPaneState } from "./splitPaneContext";
import { usePendingSplitStore, useSplitThreadStore } from "./splitThreadStore";

/** Whether the pill shows: always in a split, and alone on a started thread
    in a window wide enough (splitting a draft would only reopen the same
    draft). Callers gate on it, so a null pill never holds an empty row open. */
export function splitAgentPillShown(splitPane: SplitPaneState, startedThread: boolean): boolean {
  return splitPane.split || (splitPane.canSplit && startedThread);
}

export function SplitAgentPill(props: {
  readonly threadRef: ScopedThreadRef;
  readonly projectRef: ScopedProjectRef;
  readonly branch: string | null;
  readonly worktreePath: string | null;
}) {
  const { threadRef, projectRef, branch, worktreePath } = props;
  const splitPane = useSplitPane();
  const handleNewThread = useNewThreadHandler();
  const unpair = useSplitThreadStore((state) => state.unpair);
  // A mouse press acts on pointerdown, so mounting the new pane overlaps the
  // press instead of waiting for the release. The click that release fires
  // lands on the same button, which by then reads the other action, so it is
  // swallowed. Keyboard (detail 0) and touch still act on click.
  const actedOnPressRef = useRef(false);
  const pressHandlers = (action: () => void) => ({
    onPointerDown: (event: PointerEvent) => {
      actedOnPressRef.current = event.pointerType === "mouse" && event.button === 0;
      if (actedOnPressRef.current) action();
    },
    onClick: (event: MouseEvent) => {
      if (event.detail > 0 && actedOnPressRef.current) {
        actedOnPressRef.current = false;
        return;
      }
      action();
    },
  });

  if (splitPane.split) {
    return (
      <Button size="xs" variant="ghost" {...pressHandlers(() => unpair(threadRef))}>
        <ExternalLinkIcon className="size-3.5" />
        Pop out
      </Button>
    );
  }

  const splitAgent = () => {
    usePendingSplitStore.setState({ pending: { source: threadRef, projectRef } });
    void handleNewThread(projectRef, {
      branch,
      worktreePath,
      envMode: worktreePath ? "worktree" : "local",
      startFromOrigin: false,
    })
      .then((opened) => {
        if (!opened) return;
        useSplitThreadStore
          .getState()
          .pair(threadRef, scopeThreadRef(projectRef.environmentId, opened.threadId));
      })
      .finally(() => usePendingSplitStore.setState({ pending: null }));
  };
  return (
    <Button size="xs" variant="ghost" {...pressHandlers(splitAgent)}>
      <NavigationArrowIcon className="size-3.5" />
      Split agent
    </Button>
  );
}
