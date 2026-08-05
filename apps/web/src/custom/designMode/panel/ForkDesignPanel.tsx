import type { ScopedThreadRef } from "@t3tools/contracts";
import { Frame, Maximize2Icon, MinusIcon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";

import { useDesignChangeDraftStore } from "../designChangeDraftStore";
import { CornerRadiusIcon } from "./CornerRadiusIcon";
import { PaddingIcon } from "./PaddingIcon";
import { designModeBridge } from "../designModeBridge";
import { selectDesignModeTab, useDesignModeStore } from "../designModeStore";
import type {
  DesignModeAlignAxis,
  DesignModeAlignValue,
  DesignModeElementSnapshot,
  DesignModeSizeMode,
  DesignModeWritableKey,
} from "../protocol";
import {
  ColorField,
  PairField,
  PanelSection,
  PanelToggle,
  ScrubField,
  ValueRow,
} from "./DesignPanelFields";
import { AlignMatrix, AlignRow, SegmentField, SelectRow } from "./DesignPanelLayoutControls";
import { fieldStateFor, isMixed, type FieldStateFor } from "./selectionValues";
import {
  AbsolutePositionIcon,
  AspectLockedIcon,
  AspectUnlockedIcon,
  AutoLayoutIcon,
  DirectionColumnIcon,
  DirectionRowIcon,
  FillIcon,
  FontSizeIcon,
  FontWeightIcon,
  GapColumnIcon,
  GapRowIcon,
  GrowIcon,
  LetterSpacingIcon,
  LineHeightIcon,
  OpacityIcon,
  PerCornerIcon,
  RadiusIcon,
  ShrinkIcon,
  StrokeColorIcon,
  StrokeStyleIcon,
  StrokeWidthIcon,
  TextAlignCenterIcon,
  TextAlignJustifyIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextColorIcon,
  WrapIcon,
} from "./PanelIcons";

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

/** Keywords the sizing fields take verbatim — typing one ships the INTENT ("hug the
 * content", "drop the constraint") instead of whatever px it currently measures. */
const SIZE_KEYWORDS = ["auto", "fit-content", "min-content", "max-content"] as const;
const CONSTRAINT_KEYWORDS = ["auto", "none"] as const;
const LINE_HEIGHT_KEYWORDS = ["normal"] as const;

const DISPLAY_OPTIONS = ["block", "flex", "inline-flex", "grid", "inline-block"] as const;
const BORDER_STYLES = ["none", "solid", "dashed", "dotted"] as const;
const BORDER_WIDTH_KEYS = [
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
] as const;
const ALIGN_SELF_OPTIONS = ["auto", "flex-start", "center", "flex-end", "stretch"] as const;

type ApplyEdit = (property: DesignModeWritableKey, value: string) => void;

interface SectionProps {
  /** The first selected element — the values every field displays. */
  element: DesignModeElementSnapshot;
  /** The whole selection: toggles light only when every element agrees, and a control with
   * no "mixed" rendering of its own (the align matrix, a segment strip) goes blank instead
   * of claiming the first element's state for all of them. */
  selection: readonly DesignModeElementSnapshot[];
  apply: ApplyEdit;
  spacingBase: number | null;
  /** Mixed/changed state per field — see panel/selectionValues.ts. */
  field: FieldStateFor;
}

const isFlexDisplay = (display: string): boolean => display === "flex" || display === "inline-flex";

/** A disclosure INSIDE a section grid — the fork keeps every control the panel ever had
 * (per-side spacing, min/max sizing, the raw display select), and this is where the ones
 * Figma doesn't show by default live. Spans the whole section grid, whatever its columns. */
function Expando({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open ? "true" : "false"}
        className="col-span-full flex h-4 items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <span className="font-mono">{open ? "−" : "+"}</span>
        {label}
      </button>
      {open ? children : null}
    </>
  );
}

/** The Figma spec's top section (t3-fork V2, node 193:9686): the six align verbs over the
 * X/Y pair, with the absolute-position toggle in the header. X/Y are read-only while the
 * element is in normal flow — the reading is still true, it just isn't yours to set until
 * the element is out of flow, which is exactly what the header toggle does. */
function PositionSection({
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

const SIDES = [
  ["T", "top"],
  ["R", "right"],
  ["B", "bottom"],
  ["L", "left"],
] as const;

/** The four per-side scrubs of a box property — Padding and Margin share it, and the
 * next TRBL-shaped section is a one-liner instead of another 4-field clone block. */
function SideFields({
  prefix,
  styles,
  apply,
  field,
  tokenBasePx,
  min,
}: {
  prefix: "padding" | "margin";
  styles: DesignModeElementSnapshot["styles"];
  apply: ApplyEdit;
  field: FieldStateFor;
  tokenBasePx: number | null;
  min?: number;
}) {
  const title = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  return SIDES.map(([label, side]) => {
    const key = `${prefix}-${side}` as const;
    return (
      <ScrubField
        key={key}
        label={label}
        title={`${title} ${side}`}
        tokenBasePx={tokenBasePx}
        value={styles[key]}
        {...(min !== undefined ? { min } : {})}
        {...field(key)}
        onEdit={(v) => apply(key, v)}
      />
    );
  });
}

/**
 * The Figma spec's unified Layout section: sizing, the auto-layout cluster, padding — one
 * fixed order whether or not the element is a flex container, with the flex-only controls
 * appearing between them.
 */
function LayoutSection({
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

/** The Figma "Appearance" group: opacity, uniform radius, and an expandable per-corner
 * grid behind the corners toggle (accent-lit while open). Corner state resets with the
 * keyed fields container, like every other field-local state. */
function AppearanceSection({ element, apply, field }: SectionProps) {
  const [corners, setCorners] = useState(false);
  const { styles } = element;
  const cornerKeys = [
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-right-radius",
    "border-bottom-left-radius",
  ] as const;
  return (
    <PanelSection title="Appearance" className="grid-cols-[1fr_1fr_auto]">
      <ScrubField
        label="Opacity"
        icon={<OpacityIcon />}
        title="Opacity"
        value={styles.opacity}
        unit="none"
        min={0}
        max={1}
        step={0.01}
        precision={2}
        {...field("opacity")}
        onEdit={(v) => apply("opacity", v)}
      />
      <ScrubField
        label="Radius"
        icon={<RadiusIcon />}
        title="Corner radius (all corners)"
        value={styles["border-radius"]}
        min={0}
        // The uniform field writes the shorthand but a per-corner edit writes longhands, so
        // it counts as changed (and reverts) when either shape has a draft.
        {...field(cornerKeys, ["border-radius", ...cornerKeys])}
        onEdit={(v) => apply("border-radius", v)}
      />
      <PanelToggle
        pressed={corners}
        title={corners ? "Uniform radius" : "Per-corner radius"}
        onClick={() => setCorners((open) => !open)}
      >
        <PerCornerIcon />
      </PanelToggle>
      {corners ? (
        <>
          <ScrubField
            label="TL"
            icon={<CornerRadiusIcon corner="tl" />}
            title="Top-left radius"
            value={styles["border-top-left-radius"]}
            min={0}
            {...field("border-top-left-radius")}
            onEdit={(v) => apply("border-top-left-radius", v)}
          />
          <ScrubField
            label="TR"
            icon={<CornerRadiusIcon corner="tr" />}
            title="Top-right radius"
            value={styles["border-top-right-radius"]}
            min={0}
            {...field("border-top-right-radius")}
            onEdit={(v) => apply("border-top-right-radius", v)}
          />
          <div />
          <ScrubField
            label="BL"
            icon={<CornerRadiusIcon corner="bl" />}
            title="Bottom-left radius"
            value={styles["border-bottom-left-radius"]}
            min={0}
            {...field("border-bottom-left-radius")}
            onEdit={(v) => apply("border-bottom-left-radius", v)}
          />
          <ScrubField
            label="BR"
            icon={<CornerRadiusIcon corner="br" />}
            title="Bottom-right radius"
            value={styles["border-bottom-right-radius"]}
            min={0}
            {...field("border-bottom-right-radius")}
            onEdit={(v) => apply("border-bottom-right-radius", v)}
          />
          <div />
        </>
      ) : null}
    </PanelSection>
  );
}

/** The canvas strip: a Figma-frame toggle that hands the page to the guest's vendored
 * CanvasMode (space-drag pan, cursor-anchored wheel/pinch zoom, the powers-of-2 ladder),
 * plus discrete zoom verbs and the settled zoom readout while it's on. */
function CanvasControls({
  runtimeTabId,
  canvas,
}: {
  runtimeTabId: string;
  canvas: { on: boolean; scalePercent: number };
}) {
  const zoomButton =
    "flex size-6 items-center justify-center rounded bg-[var(--fork-design-field)] text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5";
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-4">
      <button
        type="button"
        onClick={() => designModeBridge.setCanvas(runtimeTabId, !canvas.on)}
        aria-pressed={canvas.on ? "true" : "false"}
        title={canvas.on ? "Exit canvas (restores page scroll)" : "Canvas — pan and zoom the page"}
        className={cn(
          "flex h-6 items-center gap-1.5 rounded px-1.5 text-xs transition-colors [&_svg]:size-4",
          canvas.on
            ? "bg-[var(--fork-design-accent-bg)] text-[var(--fork-design-accent)]"
            : "bg-[var(--fork-design-field)] text-muted-foreground hover:text-foreground",
        )}
      >
        <Frame />
        Canvas
      </button>
      {canvas.on ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Zoom out"
            className={zoomButton}
            onClick={() => designModeBridge.canvasCommand(runtimeTabId, "zoom-out")}
          >
            <MinusIcon />
          </button>
          <button
            type="button"
            title="Reset to 100%"
            className="h-6 min-w-10 rounded bg-[var(--fork-design-field)] px-1 text-center font-mono text-[11px] text-foreground"
            onClick={() => designModeBridge.canvasCommand(runtimeTabId, "zoom-100")}
          >
            {canvas.scalePercent}%
          </button>
          <button
            type="button"
            title="Zoom in"
            className={zoomButton}
            onClick={() => designModeBridge.canvasCommand(runtimeTabId, "zoom-in")}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            title="Zoom to fit"
            className={zoomButton}
            onClick={() => designModeBridge.canvasCommand(runtimeTabId, "zoom-fit")}
          >
            <Maximize2Icon />
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface Props {
  runtimeTabId: string | null;
  threadRef: ScopedThreadRef;
}

/**
 * The native design panel — a column docked inside the preview pane while Design mode is
 * on for the active tab. Renders the guest's selection snapshots (designModeStore, fed by
 * the console-message bridge) with T3-native controls, and drives edits back through
 * designModeBridge. Section order and field chrome follow the fork's own Figma spec
 * (t3-fork file, page V2, node 193:9686): Position, Layout, Appearance — with the controls
 * that spec doesn't draw (margins, per-side spacing, min/max, the raw display select) kept
 * behind disclosures rather than dropped. Send builds the Forge's change-request markdown
 * in the guest and attaches it to the thread composer.
 * See `.fork/customizations.yaml#fork-design-mode`.
 */
export function ForkDesignPanel({ runtimeTabId, threadRef }: Props) {
  const tab = useDesignModeStore((state) => selectDesignModeTab(state.byTabId, runtimeTabId));

  const first = tab.selection[0];
  const ids = tab.selection.map((element) => element.id);

  const apply = useCallback(
    (property: DesignModeWritableKey, value: string) => {
      if (!runtimeTabId || ids.length === 0) return;
      designModeBridge.applyDraft(runtimeTabId, ids, property, value);
    },
    // ids is rebuilt per render but changes only with the selection snapshot array.
    [runtimeTabId, tab.selection],
  );

  const setSizeMode = useCallback(
    (axis: "width" | "height", mode: DesignModeSizeMode) => {
      if (!runtimeTabId || ids.length === 0) return;
      designModeBridge.setSizeMode(runtimeTabId, ids, axis, mode);
    },
    [runtimeTabId, tab.selection],
  );

  const onAlign = useCallback(
    (axis: DesignModeAlignAxis, value: DesignModeAlignValue) => {
      if (!runtimeTabId || ids.length === 0) return;
      designModeBridge.alignSelection(runtimeTabId, ids, axis, value);
    },
    [runtimeTabId, tab.selection],
  );

  const onInset = useCallback(
    (axis: "x" | "y", px: number) => {
      if (!runtimeTabId || ids.length === 0 || !Number.isFinite(px)) return;
      designModeBridge.setInset(runtimeTabId, ids, axis, px);
    },
    [runtimeTabId, tab.selection],
  );

  const onAbsolute = useCallback(
    (on: boolean) => {
      if (!runtimeTabId || ids.length === 0) return;
      designModeBridge.setAbsolute(runtimeTabId, ids, on);
    },
    [runtimeTabId, tab.selection],
  );

  const onAspectLock = useCallback(
    (on: boolean) => {
      if (!runtimeTabId || ids.length === 0) return;
      designModeBridge.setAspectLock(runtimeTabId, ids, on);
    },
    [runtimeTabId, tab.selection],
  );

  // Per-field mixed/changed state plus its revert — one helper the sections spread onto
  // every field (`{...field("width")}`), so a new field can't quietly skip either.
  const field = useCallback(
    (...args: Parameters<FieldStateFor>) =>
      fieldStateFor(tab.selection, (properties) => {
        if (!runtimeTabId || ids.length === 0) return;
        designModeBridge.revertDraft(runtimeTabId, ids, properties);
      })(...args),
    [runtimeTabId, tab.selection],
  );

  const onCompare = useCallback(() => {
    if (!runtimeTabId) return;
    const next = !tab.comparing;
    designModeBridge.compareAll(runtimeTabId, next);
    useDesignModeStore.getState().setComparing(runtimeTabId, next);
  }, [runtimeTabId, tab.comparing]);

  const onDiscard = useCallback(() => {
    if (!runtimeTabId) return;
    designModeBridge.discardAll(runtimeTabId);
    useDesignModeStore.getState().setComparing(runtimeTabId, false);
  }, [runtimeTabId]);

  // buildSend can block up to the guest's native-source grace (~1.5s) — the flag both
  // shows the wait honestly on the button and makes a double-click during it a no-op
  // instead of a duplicate attachment pill.
  const [sending, setSending] = useState(false);
  const onSend = useCallback(async () => {
    if (!runtimeTabId || sending) return;
    setSending(true);
    try {
      const result = await designModeBridge.buildSend(runtimeTabId);
      if (!result) {
        toastManager.add({ type: "info", title: "No changes to send" });
        return;
      }
      // Attachment-style delivery: the request lands as a composer pill
      // (ForkComposerDesignChanges) rather than as prompt text — the full markdown is
      // appended to the outgoing message by ChatView's fenced send path, so the composer
      // stays readable while the agent still gets the complete deterministic request.
      useDesignChangeDraftStore.getState().add(threadRef, result);
      toastManager.add({
        type: "success",
        title:
          result.elementCount === 1
            ? "Design change attached"
            : `Design changes for ${result.elementCount} elements attached`,
        description: "It rides along with your next message — add a comment or just press Enter.",
      });
    } finally {
      setSending(false);
    }
  }, [runtimeTabId, sending, threadRef]);

  const spacingBase = tab.tokens?.spacingBasePx ?? null;

  if (!runtimeTabId || !tab.enabled) return null;

  return (
    <div
      className="flex w-[325px] shrink-0 flex-col border-l border-border bg-[var(--fork-design-surface)]"
      data-fork-design-panel
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4">
        {first ? (
          <>
            <span className="rounded bg-[var(--fork-design-field)] px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {first.tag}
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {tab.selection.length > 1
                ? `${tab.selection.length} selected`
                : (first.sourceLabel ?? "no source")}
            </span>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Design</span>
        )}
      </header>

      <CanvasControls runtimeTabId={runtimeTabId} canvas={tab.canvas} />

      {first ? (
        // Keyed by selection identity so field-local input state resets per selection.
        <div
          key={`${first.id}:${tab.selection.length}`}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4"
        >
          <PositionSection
            element={first}
            selection={tab.selection}
            onAlign={onAlign}
            onInset={onInset}
            onAbsolute={onAbsolute}
          />

          <LayoutSection
            element={first}
            selection={tab.selection}
            apply={apply}
            spacingBase={spacingBase}
            field={field}
            onSizeMode={setSizeMode}
            onAspectLock={onAspectLock}
          />

          <PanelSection title="Margin" className="grid-cols-2" defaultOpen={false}>
            <SideFields
              prefix="margin"
              styles={first.styles}
              apply={apply}
              field={field}
              tokenBasePx={spacingBase}
            />
          </PanelSection>

          <AppearanceSection
            element={first}
            selection={tab.selection}
            apply={apply}
            spacingBase={spacingBase}
            field={field}
          />

          <PanelSection title="Typography" className="grid-cols-2">
            <ValueRow
              className="col-span-2"
              label="Font"
              title="Font family (set in code)"
              value={first.styles["font-family"]}
            />
            <ScrubField
              label="Size"
              icon={<FontSizeIcon />}
              title="Font size"
              value={first.styles["font-size"]}
              min={1}
              {...field("font-size")}
              onEdit={(v) => apply("font-size", v)}
            />
            <SelectRow
              label="Weight"
              icon={<FontWeightIcon />}
              title="Font weight"
              value={first.styles["font-weight"]}
              options={FONT_WEIGHTS}
              // The options carry their Figma names ("500 Medium"); CSS takes the number.
              optionValue={(option) => option.split(" ")[0] ?? option}
              mixed={isMixed(tab.selection, "font-weight")}
              onSelect={(v) => apply("font-weight", v)}
            />
            <ScrubField
              label="Line height"
              icon={<LineHeightIcon />}
              title="Line height — type normal to hand it back to the font"
              value={first.styles["line-height"]}
              min={0}
              keywords={LINE_HEIGHT_KEYWORDS}
              {...field("line-height")}
              onEdit={(v) => apply("line-height", v)}
            />
            <ScrubField
              label="Letter spacing"
              icon={<LetterSpacingIcon />}
              title="Letter spacing"
              value={first.styles["letter-spacing"]}
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
              value={first.styles["text-align"] === "start" ? "left" : first.styles["text-align"]}
              mixed={isMixed(tab.selection, "text-align")}
              onSelect={(v) => apply("text-align", v)}
            />
            <ColorField
              tokens={tab.tokens}
              label="Color"
              icon={<TextColorIcon />}
              title="Text color"
              value={first.styles.color}
              {...field("color")}
              onEdit={(v) => apply("color", v)}
            />
          </PanelSection>

          <PanelSection title="Fill" className="grid-cols-1">
            <ColorField
              tokens={tab.tokens}
              label="Fill"
              icon={<FillIcon />}
              title="Background color"
              value={first.styles["background-color"]}
              {...field("background-color")}
              onEdit={(v) => apply("background-color", v)}
            />
          </PanelSection>

          <PanelSection title="Stroke" className="grid-cols-2">
            <ScrubField
              label="Weight"
              icon={<StrokeWidthIcon />}
              title="Border width"
              value={first.styles["border-top-width"]}
              min={0}
              {...field(BORDER_WIDTH_KEYS, ["border-width", ...BORDER_WIDTH_KEYS])}
              onEdit={(v) => apply("border-width", v)}
            />
            <SelectRow
              label="Style"
              icon={<StrokeStyleIcon />}
              title="Border style"
              value={first.styles["border-top-style"]}
              options={BORDER_STYLES}
              mixed={isMixed(tab.selection, "border-top-style")}
              onSelect={(v) => apply("border-style", v)}
            />
            <ColorField
              tokens={tab.tokens}
              label="Color"
              icon={<StrokeColorIcon />}
              title="Border color"
              value={first.styles["border-top-color"]}
              {...field("border-top-color", ["border-color"])}
              onEdit={(v) => apply("border-color", v)}
            />
            <div />
            <Expando label="Stroke per side">
              {BORDER_WIDTH_KEYS.map((key, index) => (
                <ScrubField
                  key={key}
                  label={["T", "R", "B", "L"][index] ?? key}
                  title={`Border ${key.split("-")[1]} width`}
                  value={first.styles[key]}
                  min={0}
                  {...field(key)}
                  onEdit={(v) => apply(key, v)}
                />
              ))}
            </Expando>
          </PanelSection>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center px-4 text-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {tab.sourceMode === "selector-only"
              ? "Click an element in the preview to edit it. Source mapping isn't available on this page, so changes are sent with selector and text context instead of file locations."
              : "Click an element in the preview to edit it. Shift-click adds to the selection; double-click edits text."}
          </p>
        </div>
      )}

      <footer className="shrink-0 space-y-1.5 border-t border-border px-4 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {tab.draftCount === 0
              ? "No edits yet"
              : tab.draftCount === 1
                ? "1 change"
                : `${tab.draftCount} changes`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={onCompare}
              disabled={tab.draftCount === 0}
              aria-pressed={tab.comparing ? "true" : "false"}
              type="button"
            >
              {tab.comparing ? "After" : "Before"}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={onDiscard}
              disabled={tab.draftCount === 0}
              type="button"
            >
              Discard
            </Button>
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => void onSend()}
          disabled={tab.draftCount === 0 || sending}
          type="button"
          data-fork-design-panel-send
        >
          {sending ? "Preparing…" : "Send to chat"}
        </Button>
      </footer>
    </div>
  );
}
