/**
 * The pill above the composer — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * Alone, "Split agent" opens a new draft on this thread's project, worktree
 * and branch in a pane beside it. In a split the same spot reads "Pop out",
 * which dissolves the pair and leaves this thread on screen alone.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";
import { Columns2Icon, ExternalLinkIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";

import { useSplitPane } from "./splitPaneContext";
import { usePendingSplitStore, useSplitThreadStore } from "./splitThreadStore";

export function SplitAgentPill(props: {
  readonly threadRef: ScopedThreadRef;
  readonly projectRef: ScopedProjectRef;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  /** A started thread: splitting a draft would only reopen the same draft. */
  readonly canStartSplit: boolean;
}) {
  const { threadRef, projectRef, branch, worktreePath } = props;
  const splitPane = useSplitPane();
  const handleNewThread = useNewThreadHandler();
  const unpair = useSplitThreadStore((state) => state.unpair);

  if (splitPane.split) {
    return (
      <Button size="xs" variant="glass" onClick={() => unpair(threadRef)}>
        <ExternalLinkIcon className="size-3.5" />
        Pop out
      </Button>
    );
  }

  if (!splitPane.canSplit || !props.canStartSplit) return null;
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
    <Button size="xs" variant="glass" onClick={splitAgent}>
      <Columns2Icon className="size-3.5" />
      Split agent
    </Button>
  );
}
