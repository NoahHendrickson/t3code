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
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";

import { useSplitPane } from "./splitPaneContext";
import { SPLIT_THREADS_MIN_WIDTH_QUERY } from "./SplitThreadPanes";
import { useSplitThreadStore } from "./splitThreadStore";

export function SplitAgentPill(props: {
  readonly threadRef: ScopedThreadRef;
  readonly projectRef: ScopedProjectRef;
  readonly branch: string | null;
  readonly worktreePath: string | null;
}) {
  const { threadRef, projectRef, branch, worktreePath } = props;
  const splitPane = useSplitPane();
  const wide = useMediaQuery(SPLIT_THREADS_MIN_WIDTH_QUERY);
  const handleNewThread = useNewThreadHandler();
  const unpair = useSplitThreadStore((state) => state.unpair);
  if (!wide) return null;

  if (splitPane.split) {
    return (
      <Button size="xs" variant="glass" onClick={() => unpair(threadRef)}>
        <ExternalLinkIcon className="size-3.5" />
        Pop out
      </Button>
    );
  }

  const splitAgent = async () => {
    const { setPendingSource, pair } = useSplitThreadStore.getState();
    setPendingSource(threadRef);
    try {
      const opened = await handleNewThread(projectRef, {
        branch,
        worktreePath,
        envMode: worktreePath ? "worktree" : "local",
        startFromOrigin: false,
      });
      if (opened) pair(threadRef, scopeThreadRef(projectRef.environmentId, opened.threadId));
    } finally {
      setPendingSource(null);
    }
  };
  return (
    <Button size="xs" variant="glass" onClick={() => void splitAgent()}>
      <Columns2Icon className="size-3.5" />
      Split agent
    </Button>
  );
}
