import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  FoldHorizontalIcon,
  Grid2x2Icon,
  Maximize2Icon,
  Minimize2Icon,
  ScanIcon,
} from "lucide-react";
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
  DesignModeElementSnapshot,
  DesignModeSizeMode,
  DesignModeWritableKey,
} from "../protocol";
import { ColorField, PairField, PanelSection, ScrubField } from "./DesignPanelFields";
import { AlignMatrix, SegmentField, SelectRow } from "./DesignPanelLayoutControls";

const FONT_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"] as const;
const DISPLAY_OPTIONS = ["block", "flex", "inline-flex", "grid", "inline-block"] as const;
const BORDER_STYLES = ["none", "solid", "dashed", "dotted"] as const;
const ALIGN_SELF_OPTIONS = ["auto", "flex-start", "center", "flex-end", "stretch"] as const;

type ApplyEdit = (property: DesignModeWritableKey, value: string) => void;

/** The Figma "Appearance" group: opacity, uniform radius, and an expandable per-corner
 * grid behind the corners toggle (green while open, like the design's accent buttons).
 * Corner state resets with the keyed fields container, like every other field-local
 * state. */
function AppearanceSection({
  styles,
  apply,
}: {
  styles: DesignModeElementSnapshot["styles"];
  apply: ApplyEdit;
}) {
  const [corners, setCorners] = useState(false);
  return (
    <PanelSection title="Appearance" className="grid-cols-[1fr_1fr_auto]">
      <ScrubField
        label="Op"
        title="Opacity"
        value={styles.opacity}
        unit="none"
        min={0}
        max={1}
        step={0.01}
        precision={2}
        onEdit={(v) => apply("opacity", v)}
      />
      <ScrubField
        label="R"
        title="Corner radius (all corners)"
        value={styles["border-radius"]}
        min={0}
        onEdit={(v) => apply("border-radius", v)}
      />
      <button
        type="button"
        onClick={() => setCorners((open) => !open)}
        aria-pressed={corners ? "true" : "false"}
        title={corners ? "Uniform radius" : "Per-corner radius"}
        className={cn(
          "flex size-6 items-center justify-center rounded transition-colors",
          corners
            ? "bg-[var(--fork-design-accent-bg)] text-[var(--fork-design-accent)]"
            : "bg-[var(--fork-design-field)] text-muted-foreground hover:text-foreground",
        )}
      >
        <ScanIcon className="size-4" />
      </button>
      {corners ? (
        <>
          <ScrubField
            label="TL"
            icon={<CornerRadiusIcon corner="tl" />}
            title="Top-left radius"
            value={styles["border-top-left-radius"]}
            min={0}
            onEdit={(v) => apply("border-top-left-radius", v)}
          />
          <ScrubField
            label="TR"
            icon={<CornerRadiusIcon corner="tr" />}
            title="Top-right radius"
            value={styles["border-top-right-radius"]}
            min={0}
            onEdit={(v) => apply("border-top-right-radius", v)}
          />
          <div className="size-6" />
          <ScrubField
            label="BL"
            icon={<CornerRadiusIcon corner="bl" />}
            title="Bottom-left radius"
            value={styles["border-bottom-left-radius"]}
            min={0}
            onEdit={(v) => apply("border-bottom-left-radius", v)}
          />
          <ScrubField
            label="BR"
            icon={<CornerRadiusIcon corner="br" />}
            title="Bottom-right radius"
            value={styles["border-bottom-right-radius"]}
            min={0}
            onEdit={(v) => apply("border-bottom-right-radius", v)}
          />
        </>
      ) : null}
    </PanelSection>
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
  tokenBasePx,
  min,
}: {
  prefix: "padding" | "margin";
  styles: DesignModeElementSnapshot["styles"];
  apply: ApplyEdit;
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
        onEdit={(v) => apply(key, v)}
      />
    );
  });
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
  mode: DesignModeSizeMode;
  onPick: (mode: DesignModeSizeMode) => void;
}) {
  return (
    <select
      aria-label={`${axis === "width" ? "Width" : "Height"} sizing mode`}
      value={mode}
      onChange={(event) => {
        const picked = SIZE_MODE_OPTIONS.find(([value]) => value === event.target.value);
        if (picked) onPick(picked[0]);
      }}
      className="h-full shrink-0 cursor-pointer appearance-none bg-transparent pe-1.5 text-[10px] text-muted-foreground outline-none hover:text-foreground"
    >
      {SIZE_MODE_OPTIONS.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
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
 * designModeBridge. Send builds the Forge's change-request markdown in the guest and
 * inserts it into the thread composer. See `.fork/customizations.yaml#fork-design-mode`.
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

      {first ? (
        // Keyed by selection identity so field-local input state resets per selection.
        <div
          key={`${first.id}:${tab.selection.length}`}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4"
        >
          <PanelSection title="Size" className="grid-cols-2">
            <ScrubField
              label="W"
              title="Width"
              tokenBasePx={spacingBase}
              value={first.styles.width}
              min={0}
              suffix={
                <SizeModeSelect
                  axis="width"
                  mode={first.sizeModes.width}
                  onPick={(mode) => setSizeMode("width", mode)}
                />
              }
              onEdit={(v) => apply("width", v)}
            />
            <ScrubField
              label="H"
              title="Height"
              tokenBasePx={spacingBase}
              value={first.styles.height}
              min={0}
              suffix={
                <SizeModeSelect
                  axis="height"
                  mode={first.sizeModes.height}
                  onPick={(mode) => setSizeMode("height", mode)}
                />
              }
              onEdit={(v) => apply("height", v)}
            />
          </PanelSection>

          <PanelSection
            title="Layout"
            className="grid-cols-2"
            action={
              // The Figma header's auto-layout toggle: green while the element is a flex
              // container. Turning it OFF previews as `display: block`, which the change
              // request builder rewrites as "remove auto layout" intent for the agent.
              <button
                type="button"
                onClick={() =>
                  apply(
                    "display",
                    first.styles.display === "flex" || first.styles.display === "inline-flex"
                      ? "block"
                      : "flex",
                  )
                }
                aria-pressed={
                  first.styles.display === "flex" || first.styles.display === "inline-flex"
                    ? "true"
                    : "false"
                }
                title={
                  first.styles.display === "flex" || first.styles.display === "inline-flex"
                    ? "Remove auto layout"
                    : "Add auto layout (flex)"
                }
                className={cn(
                  "flex size-6 items-center justify-center rounded transition-colors",
                  first.styles.display === "flex" || first.styles.display === "inline-flex"
                    ? "bg-[var(--fork-design-accent-bg)] text-[var(--fork-design-accent)]"
                    : "bg-[var(--fork-design-field)] text-muted-foreground hover:text-foreground",
                )}
              >
                <Grid2x2Icon className="size-4" />
              </button>
            }
          >
            <SelectRow
              label="Disp"
              title="Display"
              value={first.styles.display}
              options={DISPLAY_OPTIONS}
              onSelect={(v) => apply("display", v)}
            />
            {first.styles.display === "flex" || first.styles.display === "inline-flex" ? (
              <>
                <SegmentField
                  options={[
                    { value: "row", label: <ArrowRightIcon />, title: "Direction: row" },
                    { value: "column", label: <ArrowDownIcon />, title: "Direction: column" },
                  ]}
                  value={first.styles["flex-direction"].startsWith("column") ? "column" : "row"}
                  onSelect={(v) => apply("flex-direction", v)}
                />
                <ScrubField
                  label="Gap"
                  icon={<FoldHorizontalIcon />}
                  title="Gap"
                  tokenBasePx={spacingBase}
                  value={first.styles["row-gap"]}
                  min={0}
                  onEdit={(v) => apply("gap", v)}
                />
                <SegmentField
                  options={[
                    { value: "nowrap", label: "No wrap", title: "Wrap: nowrap" },
                    { value: "wrap", label: "Wrap", title: "Wrap: wrap" },
                  ]}
                  value={first.styles["flex-wrap"]}
                  onSelect={(v) => apply("flex-wrap", v)}
                />
                <div className="col-span-2 flex items-start gap-2">
                  <AlignMatrix
                    direction={
                      first.styles["flex-direction"].startsWith("column") ? "column" : "row"
                    }
                    justifyContent={first.styles["justify-content"]}
                    alignItems={first.styles["align-items"]}
                    onChange={(justify, align) => {
                      apply("justify-content", justify);
                      apply("align-items", align);
                    }}
                  />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <SelectRow
                      label="Self"
                      title="Align self (this element within its parent)"
                      value={first.styles["align-self"]}
                      options={ALIGN_SELF_OPTIONS}
                      onSelect={(v) => apply("align-self", v)}
                    />
                    <ScrubField
                      label="Grow"
                      icon={<Maximize2Icon />}
                      title="Flex grow"
                      value={first.styles["flex-grow"]}
                      unit="none"
                      min={0}
                      step={0.1}
                      precision={1}
                      onEdit={(v) => apply("flex-grow", v)}
                    />
                    <ScrubField
                      label="Shrink"
                      icon={<Minimize2Icon />}
                      title="Flex shrink"
                      value={first.styles["flex-shrink"]}
                      unit="none"
                      min={0}
                      step={0.1}
                      precision={1}
                      onEdit={(v) => apply("flex-shrink", v)}
                    />
                  </div>
                </div>
              </>
            ) : null}
          </PanelSection>

          <PanelSection title="Padding" className="grid-cols-2">
            <PairField
              label="LR"
              icon={<PaddingIcon axis="inline" />}
              title="Padding left / right — type one value for both, or two: 8, 16"
              tokenBasePx={spacingBase}
              values={[first.styles["padding-left"], first.styles["padding-right"]]}
              min={0}
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
              values={[first.styles["padding-top"], first.styles["padding-bottom"]]}
              min={0}
              onEdit={(top, bottom) => {
                apply("padding-top", top);
                apply("padding-bottom", bottom);
              }}
            />
          </PanelSection>

          <PanelSection title="Margin" className="grid-cols-2">
            <SideFields
              prefix="margin"
              styles={first.styles}
              apply={apply}
              tokenBasePx={spacingBase}
            />
          </PanelSection>

          <AppearanceSection styles={first.styles} apply={apply} />

          <PanelSection title="Typography" className="grid-cols-2">
            <ScrubField
              label="Sz"
              title="Font size"
              value={first.styles["font-size"]}
              min={1}
              onEdit={(v) => apply("font-size", v)}
            />
            <SelectRow
              label="Wt"
              title="Font weight"
              value={first.styles["font-weight"]}
              options={FONT_WEIGHTS}
              onSelect={(v) => apply("font-weight", v)}
            />
            <ScrubField
              label="Lh"
              title="Line height"
              value={first.styles["line-height"]}
              min={0}
              onEdit={(v) => apply("line-height", v)}
            />
            <ScrubField
              label="Ls"
              title="Letter spacing"
              value={first.styles["letter-spacing"]}
              step={0.1}
              precision={1}
              onEdit={(v) => apply("letter-spacing", v)}
            />
            <SegmentField
              className="col-span-2"
              options={[
                { value: "left", label: "Left", title: "Align left" },
                { value: "center", label: "Center", title: "Align center" },
                { value: "right", label: "Right", title: "Align right" },
                { value: "justify", label: "Just", title: "Justify" },
              ]}
              value={first.styles["text-align"] === "start" ? "left" : first.styles["text-align"]}
              onSelect={(v) => apply("text-align", v)}
            />
            <ColorField
              tokens={tab.tokens}
              label="C"
              title="Text color"
              value={first.styles.color}
              onEdit={(v) => apply("color", v)}
            />
          </PanelSection>

          <PanelSection title="Fill" className="grid-cols-1">
            <ColorField
              tokens={tab.tokens}
              label="Bg"
              title="Background color"
              value={first.styles["background-color"]}
              onEdit={(v) => apply("background-color", v)}
            />
          </PanelSection>

          <PanelSection title="Stroke" className="grid-cols-2">
            <SelectRow
              label="Sty"
              title="Border style"
              value={first.styles["border-top-style"]}
              options={BORDER_STYLES}
              onSelect={(v) => apply("border-style", v)}
            />
            <ScrubField
              label="W"
              title="Border width"
              value={first.styles["border-top-width"]}
              min={0}
              onEdit={(v) => apply("border-width", v)}
            />
            <ColorField
              tokens={tab.tokens}
              label="C"
              title="Border color"
              value={first.styles["border-top-color"]}
              onEdit={(v) => apply("border-color", v)}
            />
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
