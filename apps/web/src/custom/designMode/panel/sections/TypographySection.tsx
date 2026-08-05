import type { DesignModeTokens } from "../../designModeStore";
import { ColorField, PanelSection, ScrubField, ValueRow } from "../DesignPanelFields";
import { SegmentField, SelectRow } from "../DesignPanelLayoutControls";
import {
  FontSizeIcon,
  FontWeightIcon,
  LetterSpacingIcon,
  LineHeightIcon,
  TextAlignCenterIcon,
  TextAlignJustifyIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextColorIcon,
} from "../PanelIcons";
import { isMixed } from "../selectionValues";
import type { SectionProps } from "./section";

/** Figma's weight names beside the numbers — the vocabulary the vendored panel used
 * (engine/vendor/panel-specs.ts WEIGHTS), which is what a designer reads. */
const FONT_WEIGHTS = [
  "100 Thin",
  "200 Extra Light",
  "300 Light",
  "400 Regular",
  "500 Medium",
  "600 Semibold",
  "700 Bold",
  "800 Extra Bold",
  "900 Black",
] as const;

const LINE_HEIGHT_KEYWORDS = ["normal"] as const;

export function TypographySection({
  element,
  selection,
  apply,
  field,
  tokens,
}: SectionProps & { tokens: DesignModeTokens | null }) {
  const { styles } = element;
  return (
    <PanelSection title="Typography" className="grid-cols-2">
      <ValueRow
        className="col-span-2"
        label="Font"
        title="Font family (set in code)"
        value={styles["font-family"]}
      />
      <ScrubField
        label="Size"
        icon={<FontSizeIcon />}
        title="Font size"
        value={styles["font-size"]}
        min={1}
        {...field("font-size")}
        onEdit={(v) => apply("font-size", v)}
      />
      <SelectRow
        label="Weight"
        icon={<FontWeightIcon />}
        title="Font weight"
        value={styles["font-weight"]}
        options={FONT_WEIGHTS}
        // The options carry their Figma names ("500 Medium"); CSS takes the number.
        optionValue={(option) => option.split(" ")[0] ?? option}
        mixed={isMixed(selection, "font-weight")}
        onSelect={(v) => apply("font-weight", v)}
      />
      <ScrubField
        label="Line height"
        icon={<LineHeightIcon />}
        title="Line height — type normal to hand it back to the font"
        value={styles["line-height"]}
        min={0}
        keywords={LINE_HEIGHT_KEYWORDS}
        {...field("line-height")}
        onEdit={(v) => apply("line-height", v)}
      />
      <ScrubField
        label="Letter spacing"
        icon={<LetterSpacingIcon />}
        title="Letter spacing"
        value={styles["letter-spacing"]}
        step={0.1}
        precision={1}
        {...field("letter-spacing")}
        onEdit={(v) => apply("letter-spacing", v)}
      />
      <SegmentField
        className="col-span-2"
        options={[
          { value: "left", label: <TextAlignLeftIcon />, title: "Align left" },
          { value: "center", label: <TextAlignCenterIcon />, title: "Align center" },
          { value: "right", label: <TextAlignRightIcon />, title: "Align right" },
          { value: "justify", label: <TextAlignJustifyIcon />, title: "Justify" },
        ]}
        value={styles["text-align"] === "start" ? "left" : styles["text-align"]}
        mixed={isMixed(selection, "text-align")}
        onSelect={(v) => apply("text-align", v)}
      />
      <ColorField
        tokens={tokens}
        label="Color"
        icon={<TextColorIcon />}
        title="Text color"
        value={styles.color}
        {...field("color")}
        onEdit={(v) => apply("color", v)}
      />
    </PanelSection>
  );
}
