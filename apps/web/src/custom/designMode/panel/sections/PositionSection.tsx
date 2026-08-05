import type {
  DesignModeAlignAxis,
  DesignModeAlignValue,
  DesignModeElementSnapshot,
} from "../../protocol";
import { PanelSection, PanelToggle, ScrubField } from "../DesignPanelFields";
import { AlignRow } from "../DesignPanelLayoutControls";
import { AbsolutePositionIcon } from "../PanelIcons";

/** The Figma spec's top section (t3-fork V2, node 193:9686): the six align verbs over the
 * X/Y pair, with the absolute-position toggle in the header. X/Y are read-only while the
 * element is in normal flow — the reading is still true, it just isn't yours to set until
 * the element is out of flow, which is exactly what the header toggle does. */
export function PositionSection({
  element,
  selection,
  onAlign,
  onInset,
  onAbsolute,
}: {
  element: DesignModeElementSnapshot;
  selection: readonly DesignModeElementSnapshot[];
  onAlign: (axis: DesignModeAlignAxis, value: DesignModeAlignValue) => void;
  onInset: (axis: "x" | "y", px: number) => void;
  onAbsolute: (on: boolean) => void;
}) {
  // Every element has to be out of flow before X/Y are yours to set: the guest refuses the
  // write for the in-flow ones anyway (POSITION_ROWS' `editable`), and a field that commits
  // for half a selection is worse than one that says "not yet".
  const absolute = selection.every((item) => item.positionState !== "flow");
  // An axis is offered only when EVERY selected element can honor it — the caps are an
  // intersection, not the first element's opinion.
  const caps = {
    horizontal: selection.every((item) => item.alignCaps.horizontal),
    vertical: selection.every((item) => item.alignCaps.vertical),
  };
  const mixedOffset = (axis: "x" | "y") =>
    selection.some((item) => item.offsets[axis] !== element.offsets[axis]);
  return (
    <PanelSection
      title="Position"
      className="grid-cols-2"
      action={
        <PanelToggle
          pressed={absolute}
          title={absolute ? "Return to normal flow" : "Position absolutely"}
          onClick={() => onAbsolute(!absolute)}
        >
          <AbsolutePositionIcon />
        </PanelToggle>
      }
    >
      <AlignRow caps={caps} onAlign={onAlign} />
      <ScrubField
        label="X"
        title={absolute ? "X position" : "X offset (read-only while in flow)"}
        value={String(element.offsets.x)}
        readOnly={!absolute}
        mixed={mixedOffset("x")}
        onEdit={(value) => onInset("x", Number.parseFloat(value))}
      />
      <ScrubField
        label="Y"
        title={absolute ? "Y position" : "Y offset (read-only while in flow)"}
        value={String(element.offsets.y)}
        readOnly={!absolute}
        mixed={mixedOffset("y")}
        onEdit={(value) => onInset("y", Number.parseFloat(value))}
      />
    </PanelSection>
  );
}
