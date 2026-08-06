import { PanelLeftIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

import { selectDesignModeTab, useDesignModeStore } from "./designModeStore";
import {
  LAYERS_HIDE_BUTTON,
  LAYERS_RAIL_ID,
  focusLayersControl,
  layersRailAvailable,
  useLayersCollapsed,
} from "./layersCollapsed";

/**
 * The way back into a collapsed layers rail, mounted at the head of the preview chrome row
 * (PreviewView's `leadingActions` fence). The rail hides itself from its own header; once
 * hidden it renders nothing at all, so its reopen control has to live outside it.
 *
 * Only while the rail would otherwise be there — design mode on, a layers tree received,
 * and collapsed. Expanded, the rail's own header button is the control and a second one
 * here would just be chrome. See `.fork/customizations.yaml#fork-design-mode`.
 */
export function ForkPreviewLayersToggle({ runtimeTabId }: { runtimeTabId: string | null }) {
  // A primitive, not the tab object: that identity changes on every selection, layers and
  // tokens patch — up to ~4/s while an agent edits the page — and this button is mounted in
  // the always-rendered chrome row. It only cares about one transition.
  const railWouldRender = useDesignModeStore((state) =>
    layersRailAvailable(selectDesignModeTab(state.byTabId, runtimeTabId), runtimeTabId),
  );
  const [collapsed, setCollapsed] = useLayersCollapsed();

  if (!collapsed || !railWouldRender) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setCollapsed(false);
              // This button unmounts itself — hand focus to the rail's own hide control.
              focusLayersControl(LAYERS_HIDE_BUTTON);
            }}
            aria-label="Show layers"
            aria-expanded={false}
            aria-controls={LAYERS_RAIL_ID}
            type="button"
            data-fork-design-layers-toggle
          />
        }
      >
        <PanelLeftIcon />
      </TooltipTrigger>
      <TooltipPopup>Show layers</TooltipPopup>
    </Tooltip>
  );
}
