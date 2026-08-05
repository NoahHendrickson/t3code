import type { DesignModeSizeMode } from "../../protocol";
import { PairField, PanelSection, PanelToggle, ScrubField } from "../DesignPanelFields";
import { AlignMatrix, SegmentField, SelectRow } from "../DesignPanelLayoutControls";
import { PaddingIcon } from "../PaddingIcon";
import {
  AspectLockedIcon,
  AspectUnlockedIcon,
  AutoLayoutIcon,
  DirectionColumnIcon,
  DirectionRowIcon,
  GapColumnIcon,
  GapRowIcon,
  GrowIcon,
  ShrinkIcon,
  WrapIcon,
} from "../PanelIcons";
import { isMixed } from "../selectionValues";
import { Expando, SideFields, isFlexDisplay, type SectionProps } from "./section";

/** Keywords the sizing fields take verbatim — typing one ships the INTENT ("hug the
 * content", "drop the constraint") instead of whatever px it currently measures. */
const SIZE_KEYWORDS = ["auto", "fit-content", "min-content", "max-content"] as const;
const CONSTRAINT_KEYWORDS = ["auto", "none"] as const;

const DISPLAY_OPTIONS = ["block", "flex", "inline-flex", "grid", "inline-block"] as const;
const ALIGN_SELF_OPTIONS = ["auto", "flex-start", "center", "flex-end", "stretch"] as const;

const SIZE_MODE_OPTIONS = [
  ["fixed", "Fixed"],
  ["hug", "Hug"],
  ["fill", "Fill"],
] as const;

/** Figma's per-axis sizing menu, docked at the right edge of the W/H fields. The guest
 * owns the coordinated write (engine/sizeMode.ts) and answers with a fresh snapshot. */
function SizeModeSelect({
  axis,
  mode,
  onPick,
}: {
  axis: "width" | "height";
  /** null when the selection disagrees — the menu shows Mixed until a pick unifies them. */
  mode: DesignModeSizeMode | null;
  onPick: (mode: DesignModeSizeMode) => void;
}) {
  return (
    <select
      aria-label={`${axis === "width" ? "Width" : "Height"} sizing mode`}
      value={mode ?? ""}
      onChange={(event) => {
        const picked = SIZE_MODE_OPTIONS.find(([value]) => value === event.target.value);
        if (picked) onPick(picked[0]);
      }}
      className="h-full shrink-0 cursor-pointer appearance-none bg-transparent pe-1.5 text-[10px] text-muted-foreground outline-none hover:text-foreground"
    >
      {mode === null ? <option value="">Mixed</option> : null}
      {SIZE_MODE_OPTIONS.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

/**
 * The Figma spec's unified Layout section: sizing, the auto-layout cluster, padding — one
 * fixed order whether or not the element is a flex container, with the flex-only controls
 * appearing between them.
 */
export function LayoutSection({
  element,
  selection,
  apply,
  spacingBase,
  field,
  onSizeMode,
  onAspectLock,
}: SectionProps & {
  onSizeMode: (axis: "width" | "height", mode: DesignModeSizeMode) => void;
  onAspectLock: (on: boolean) => void;
}) {
  const { styles } = element;
  const mixedDisplay = isMixed(selection, "display");
  const mixedDirection = isMixed(selection, "flex-direction");
  const flex = selection.every((item) => isFlexDisplay(item.styles.display));
  const column = styles["flex-direction"].startsWith("column");
  const aspectLocked = selection.every(
    (item) => item.styles["aspect-ratio"] !== "auto" && item.styles["aspect-ratio"] !== "",
  );
  const sizeMode = (axis: "width" | "height") =>
    selection.every((item) => item.sizeModes[axis] === element.sizeModes[axis])
      ? element.sizeModes[axis]
      : null;
  return (
    <PanelSection
      title="Layout"
      className="grid-cols-[1fr_1fr_auto]"
      action={
        // Figma's auto-layout toggle. Turning it OFF previews as `display: block`, which the
        // change request builder reads as "remove auto layout" intent for the agent.
        <PanelToggle
          pressed={flex}
          title={flex ? "Remove auto layout" : "Add auto layout (flex)"}
          onClick={() => apply("display", flex ? "block" : "flex")}
        >
          <AutoLayoutIcon />
        </PanelToggle>
      }
    >
      <ScrubField
        label="W"
        title="Width"
        tokenBasePx={spacingBase}
        value={styles.width}
        min={0}
        keywords={SIZE_KEYWORDS}
        {...field("width")}
        suffix={
          <SizeModeSelect
            axis="width"
            mode={sizeMode("width")}
            onPick={(mode) => onSizeMode("width", mode)}
          />
        }
        onEdit={(v) => apply("width", v)}
      />
      <ScrubField
        label="H"
        title="Height"
        tokenBasePx={spacingBase}
        value={styles.height}
        min={0}
        keywords={SIZE_KEYWORDS}
        {...field("height")}
        suffix={
          <SizeModeSelect
            axis="height"
            mode={sizeMode("height")}
            onPick={(mode) => onSizeMode("height", mode)}
          />
        }
        onEdit={(v) => apply("height", v)}
      />
      <PanelToggle
        pressed={aspectLocked}
        title={aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
        onClick={() => onAspectLock(!aspectLocked)}
      >
        {aspectLocked ? <AspectLockedIcon /> : <AspectUnlockedIcon />}
      </PanelToggle>

      <Expando label="Min / max size">
        <ScrubField
          label="Min W"
          title="Minimum width — type auto to drop the constraint"
          tokenBasePx={spacingBase}
          value={styles["min-width"]}
          min={0}
          keywords={CONSTRAINT_KEYWORDS}
          {...field("min-width")}
          onEdit={(v) => apply("min-width", v)}
        />
        <ScrubField
          label="Min H"
          title="Minimum height — type auto to drop the constraint"
          tokenBasePx={spacingBase}
          value={styles["min-height"]}
          min={0}
          keywords={CONSTRAINT_KEYWORDS}
          {...field("min-height")}
          onEdit={(v) => apply("min-height", v)}
        />
        <div />
        <ScrubField
          label="Max W"
          title="Maximum width — type none to drop the constraint"
          tokenBasePx={spacingBase}
          value={styles["max-width"]}
          min={0}
          keywords={CONSTRAINT_KEYWORDS}
          {...field("max-width")}
          onEdit={(v) => apply("max-width", v)}
        />
        <ScrubField
          label="Max H"
          title="Maximum height — type none to drop the constraint"
          tokenBasePx={spacingBase}
          value={styles["max-height"]}
          min={0}
          keywords={CONSTRAINT_KEYWORDS}
          {...field("max-height")}
          onEdit={(v) => apply("max-height", v)}
        />
        <div />
      </Expando>

      {flex ? (
        <>
          <SegmentField
            className="col-span-full"
            options={[
              { value: "row", label: <DirectionRowIcon />, title: "Direction: row" },
              { value: "column", label: <DirectionColumnIcon />, title: "Direction: column" },
            ]}
            value={column ? "column" : "row"}
            mixed={mixedDirection}
            onSelect={(v) => apply("flex-direction", v)}
          />
          <div className="col-span-full flex items-start gap-2">
            <AlignMatrix
              direction={column ? "column" : "row"}
              justifyContent={styles["justify-content"]}
              alignItems={styles["align-items"]}
              mixed={isMixed(selection, ["justify-content", "align-items"])}
              onChange={(justify, align) => {
                apply("justify-content", justify);
                apply("align-items", align);
              }}
            />
            <div className="grid min-w-0 flex-1 gap-2">
              <ScrubField
                label="Gap"
                icon={column ? <GapColumnIcon /> : <GapRowIcon />}
                title="Gap between children"
                tokenBasePx={spacingBase}
                value={styles["row-gap"]}
                min={0}
                // Reads the longhand, writes the `gap` shorthand — so revert has to drop
                // what was written, not what is displayed.
                {...field(["row-gap", "column-gap"], ["gap"])}
                onEdit={(v) => apply("gap", v)}
              />
              <SegmentField
                options={[
                  { value: "nowrap", label: "No wrap", title: "Wrap: nowrap" },
                  { value: "wrap", label: <WrapIcon />, title: "Wrap: wrap" },
                ]}
                value={styles["flex-wrap"]}
                mixed={isMixed(selection, "flex-wrap")}
                onSelect={(v) => apply("flex-wrap", v)}
              />
            </div>
          </div>
        </>
      ) : null}

      <PairField
        label="LR"
        icon={<PaddingIcon axis="inline" />}
        title="Padding left / right — type one value for both, or two: 8, 16"
        tokenBasePx={spacingBase}
        values={[styles["padding-left"], styles["padding-right"]]}
        min={0}
        {...field(["padding-left", "padding-right"])}
        onEdit={(left, right) => {
          apply("padding-left", left);
          apply("padding-right", right);
        }}
      />
      <PairField
        label="TB"
        icon={<PaddingIcon axis="block" />}
        title="Padding top / bottom — type one value for both, or two: 8, 16"
        tokenBasePx={spacingBase}
        values={[styles["padding-top"], styles["padding-bottom"]]}
        min={0}
        {...field(["padding-top", "padding-bottom"])}
        onEdit={(top, bottom) => {
          apply("padding-top", top);
          apply("padding-bottom", bottom);
        }}
      />
      <div />

      <Expando label="Padding per side">
        <SideFields
          prefix="padding"
          styles={styles}
          apply={apply}
          field={field}
          tokenBasePx={spacingBase}
          min={0}
        />
      </Expando>

      <Expando label="Flex child and display">
        <SelectRow
          label="Disp"
          title="Display"
          value={styles.display}
          options={DISPLAY_OPTIONS}
          mixed={mixedDisplay}
          onSelect={(v) => apply("display", v)}
        />
        <SelectRow
          label="Self"
          title="Align self (this element within its parent)"
          value={styles["align-self"]}
          options={ALIGN_SELF_OPTIONS}
          mixed={isMixed(selection, "align-self")}
          onSelect={(v) => apply("align-self", v)}
        />
        <div />
        <ScrubField
          label="Grow"
          icon={<GrowIcon />}
          title="Flex grow"
          value={styles["flex-grow"]}
          unit="none"
          min={0}
          step={0.1}
          precision={1}
          {...field("flex-grow")}
          onEdit={(v) => apply("flex-grow", v)}
        />
        <ScrubField
          label="Shrink"
          icon={<ShrinkIcon />}
          title="Flex shrink"
          value={styles["flex-shrink"]}
          unit="none"
          min={0}
          step={0.1}
          precision={1}
          {...field("flex-shrink")}
          onEdit={(v) => apply("flex-shrink", v)}
        />
        <div />
      </Expando>
    </PanelSection>
  );
}
