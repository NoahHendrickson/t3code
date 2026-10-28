/**
 * Float / Dock in a thread's header — see `.fork/customizations.yaml#fork-split-threads`.
 *
 * Float lifts the thread into a window over the chat column; inside that
 * window the same spot reads Dock, which lands it beside the column's thread
 * as a split.
 */
import { PictureInPicture2, SquareSplitHorizontal } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

export function FloatPaneButton(props: {
  readonly floating: boolean;
  readonly onPress: () => void;
}) {
  const label = props.floating ? "Dock beside" : "Float thread";
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
          aria-label={label}
          onClick={props.onPress}
        >
          {props.floating ? (
            <SquareSplitHorizontal className="size-4" />
          ) : (
            <PictureInPicture2 className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}
