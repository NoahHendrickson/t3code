import type { DesignModeTokens } from "../../designModeStore";
import { ColorField, PanelSection, ScrubField } from "../DesignPanelFields";
import { SelectRow } from "../DesignPanelLayoutControls";
import { FillIcon, StrokeColorIcon, StrokeStyleIcon, StrokeWidthIcon } from "../PanelIcons";
import { isMixed } from "../selectionValues";
import { BORDER_WIDTH_KEYS, Expando, MARGIN_KEYS, SideFields, type SectionProps } from "./section";

const BORDER_STYLES = ["none", "solid", "dashed", "dotted"] as const;

/** Figma's Fill. One background colour today — a fill LIST (multiple layers, per-fill
 * opacity and visibility) is the next thing this section grows, and it grows here. */
export function FillSection({
  element,
  apply,
  field,
  tokens,
}: SectionProps & { tokens: DesignModeTokens | null }) {
  return (
    <PanelSection title="Fill" className="grid-cols-1">
      <ColorField
        tokens={tokens}
        label="Fill"
        icon={<FillIcon />}
        title="Background color"
        value={element.styles["background-color"]}
        {...field("background-color")}
        onEdit={(v) => apply("background-color", v)}
      />
    </PanelSection>
  );
}

export function StrokeSection({
  element,
  selection,
  apply,
  field,
  tokens,
}: SectionProps & { tokens: DesignModeTokens | null }) {
  const { styles } = element;
  return (
    <PanelSection title="Stroke" className="grid-cols-2">
      <ScrubField
        label="Weight"
        icon={<StrokeWidthIcon />}
        title="Border width"
        value={styles["border-top-width"]}
        min={0}
        // Writes the shorthand; a per-side edit below writes longhands. Either shape counts
        // as changed here, and reverting drops both.
        {...field(BORDER_WIDTH_KEYS, ["border-width", ...BORDER_WIDTH_KEYS])}
        onEdit={(v) => apply("border-width", v)}
      />
      <SelectRow
        label="Style"
        icon={<StrokeStyleIcon />}
        title="Border style"
        value={styles["border-top-style"]}
        options={BORDER_STYLES}
        mixed={isMixed(selection, "border-top-style")}
        onSelect={(v) => apply("border-style", v)}
      />
      <ColorField
        tokens={tokens}
        label="Color"
        icon={<StrokeColorIcon />}
        title="Border color"
        value={styles["border-top-color"]}
        {...field("border-top-color", ["border-color"])}
        onEdit={(v) => apply("border-color", v)}
      />
      <div />
      <Expando label="Stroke per side">
        <SideFields
          keys={BORDER_WIDTH_KEYS}
          title={(side) => `Border ${side} width`}
          styles={styles}
          apply={apply}
          field={field}
          min={0}
        />
      </Expando>
    </PanelSection>
  );
}

/** Margins are a code concept a designer never sees, which is why the Figma spec doesn't
 * draw them — but they remain editable here, collapsed, rather than being taken away. */
export function MarginSection({ element, apply, spacingBase, field }: SectionProps) {
  return (
    <PanelSection title="Margin" className="grid-cols-2" defaultOpen={false}>
      <SideFields
        keys={MARGIN_KEYS}
        title={(side) => `Margin ${side}`}
        styles={element.styles}
        apply={apply}
        field={field}
        tokenBasePx={spacingBase}
      />
    </PanelSection>
  );
}
