/**
 * The X on a split pane's unsent draft — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * Cancels the pane "Split agent" opened: the route moves to the other pane,
 * the pair dissolves, and the draft is discarded the way the sidebar's draft
 * cards discard one. A sent draft is a thread and closes with "Pop out".
 */
import type { ScopedThreadRef } from "@t3tools/contracts";
import { XIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useComposerDraftStore, type DraftId } from "~/composerDraftStore";
import { releaseComposerDraftUploads } from "~/lib/composerDraftUploads";

import { useSplitPane } from "./splitPaneContext";
import { useSplitThreadStore } from "./splitThreadStore";

export function SplitPaneCloseButton(props: {
  readonly draftId: DraftId;
  readonly threadRef: ScopedThreadRef;
}) {
  const { draftId, threadRef } = props;
  const splitPane = useSplitPane();
  const unpair = useSplitThreadStore((state) => state.unpair);
  const close = async () => {
    // Off the draft's route first: clearing the draft under it would send the
    // route home instead of to the thread beside it.
    await splitPane.focusPartner();
    unpair(threadRef);
    releaseComposerDraftUploads(draftId);
    useComposerDraftStore.getState().clearDraftThread(draftId);
  };
  return (
    <Tooltip>
      <TooltipTrigger
        // data-split-pane-action keeps a press here from first focusing the pane.
        render={<span className="flex shrink-0" data-fork-panel-toggle data-split-pane-action />}
      >
        <Button
          className="shrink-0 [-webkit-app-region:no-drag]"
          variant="ghost"
          size="icon-sm"
          aria-label="Close new agent"
          onClick={() => void close()}
        >
          <XIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipPopup side="bottom">Close new agent</TooltipPopup>
    </Tooltip>
  );
}
