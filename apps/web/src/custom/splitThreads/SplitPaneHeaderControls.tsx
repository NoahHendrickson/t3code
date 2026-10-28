/**
 * A pane's controls in the thread header — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * Float lifts a started thread into a window over the chat column; inside
 * that window the same spot reads Dock, which lands it beside the column's
 * thread as a split. The window has no room for panels, so it drops the panel
 * toggles until it docks. A split pane's unsent draft gets an X that closes
 * the pane.
 */
import type { ScopedThreadRef } from "@t3tools/contracts";
import { PictureInPicture2, SquareSplitHorizontal, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  composerDraftHasUserContent,
  useComposerDraftStore,
  type DraftId,
} from "~/composerDraftStore";
import { releaseComposerDraftUploads } from "~/lib/composerDraftUploads";

import { useSplitPane } from "./splitPaneContext";
import { useSplitThreadStore } from "./splitThreadStore";

function PaneActionButton(props: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onPress: () => void;
}) {
  return (
    <div className="pointer-events-auto flex h-full items-center">
      <Tooltip>
        <TooltipTrigger
          // data-split-pane-action keeps a press here from first focusing the pane.
          render={<span className="flex shrink-0" data-fork-panel-toggle data-split-pane-action />}
        >
          <Button
            className="shrink-0 [-webkit-app-region:no-drag]"
            variant="ghost"
            size="icon-sm"
            aria-label={props.label}
            onClick={props.onPress}
          >
            {props.icon}
          </Button>
        </TooltipTrigger>
        <TooltipPopup side="bottom">{props.label}</TooltipPopup>
      </Tooltip>
    </div>
  );
}

export function SplitPaneHeaderControls(props: {
  readonly panelToggleControls: ReactNode;
  /** The pane's thread while it is an unsent draft, else null. */
  readonly draftId: DraftId | null;
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { draftId, threadRef } = props;
  const splitPane = useSplitPane();
  const unpair = useSplitThreadStore((state) => state.unpair);
  const { windowAction } = splitPane;

  const close = (draft: DraftId, ref: ScopedThreadRef) => {
    // Off the draft's route first: clearing the draft under it would send the
    // route home instead of to the thread beside it.
    void splitPane.focusPartner().then((left) => {
      if (!left) return;
      unpair(ref);
      // Only an empty draft is discarded, as "Split agent" left it. One the
      // user has written in, or paired from the sidebar, stays a draft of its own.
      const drafts = useComposerDraftStore.getState();
      if (composerDraftHasUserContent(drafts.getComposerDraft(draft))) return;
      releaseComposerDraftUploads(draft);
      drafts.clearDraftThread(draft);
    });
  };

  return (
    <>
      {windowAction ? (
        <PaneActionButton
          label={windowAction.kind === "dock" ? "Dock beside" : "Float thread"}
          icon={
            windowAction.kind === "dock" ? (
              <SquareSplitHorizontal className="size-4" />
            ) : (
              <PictureInPicture2 className="size-4" />
            )
          }
          onPress={windowAction.run}
        />
      ) : null}
      {splitPane.floating ? null : (
        <div className="pointer-events-auto flex h-full items-center">
          {props.panelToggleControls}
        </div>
      )}
      {splitPane.split && draftId !== null && threadRef !== null ? (
        <PaneActionButton
          label="Close new agent"
          icon={<XIcon className="size-4" />}
          onPress={() => close(draftId, threadRef)}
        />
      ) : null}
    </>
  );
}
