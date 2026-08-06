import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useState } from "react";

import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";

import { useDesignChangeDraftStore } from "../designChangeDraftStore";
import { designModeBridge } from "../designModeBridge";
import { selectDesignModeTab, useDesignModeStore } from "../designModeStore";
import type {
  DesignModeAlignAxis,
  DesignModeAlignValue,
  DesignModeSizeMode,
  DesignModeWritableKey,
} from "../protocol";
import { CanvasControls } from "./CanvasControls";
import { AppearanceSection } from "./sections/AppearanceSection";
import { LayoutSection } from "./sections/LayoutSection";
import { FillSection, MarginSection, StrokeSection } from "./sections/PaintSections";
import { PositionSection } from "./sections/PositionSection";
import { TypographySection } from "./sections/TypographySection";
import { fieldStateFor, type FieldStateFor } from "./selectionValues";

interface Props {
  runtimeTabId: string | null;
  threadRef: ScopedThreadRef;
  /** Which preview tab this panel is docked beside. An identifier, not surface state: the
   * canvas strip's screen-size picker reads the viewport for itself. */
  tabId: string | null;
}

/**
 * The native design panel — a column docked inside the preview pane while Design mode is
 * on for the active tab. This module is the wiring: it reads the guest's selection
 * snapshots (designModeStore, fed by the console-message bridge), turns panel intent into
 * designModeBridge commands, and composes the sections — every section itself lives in
 * `panel/sections/`.
 *
 * Section order and field chrome follow the fork's own Figma spec (t3-fork file, page V2,
 * node 193:9686): Position, Layout, Appearance — with the controls that spec doesn't draw
 * (margins, per-side spacing, min/max, the raw display select) kept behind disclosures
 * rather than dropped. Send builds the Forge's change-request markdown in the guest and
 * attaches it to the thread composer.
 * See `.fork/customizations.yaml#fork-design-mode`.
 */
export function ForkDesignPanel({ runtimeTabId, threadRef, tabId }: Props) {
  const tab = useDesignModeStore((state) => selectDesignModeTab(state.byTabId, runtimeTabId));

  const first = tab.selection[0];
  const ids = tab.selection.map((element) => element.id);
  /** Every verb below is a no-op without a tab and a selection — one gate, not six. */
  const target = runtimeTabId !== null && ids.length > 0 ? runtimeTabId : null;

  const apply = useCallback(
    (property: DesignModeWritableKey, value: string) => {
      if (target) designModeBridge.applyDraft(target, ids, property, value);
    },
    // ids is rebuilt per render but changes only with the selection snapshot array.
    [target, tab.selection],
  );

  const setSizeMode = useCallback(
    (axis: "width" | "height", mode: DesignModeSizeMode) => {
      if (target) designModeBridge.setSizeMode(target, ids, axis, mode);
    },
    [target, tab.selection],
  );

  const onAlign = useCallback(
    (axis: DesignModeAlignAxis, value: DesignModeAlignValue) => {
      if (target) designModeBridge.alignSelection(target, ids, axis, value);
    },
    [target, tab.selection],
  );

  const onInset = useCallback(
    (axis: "x" | "y", px: number) => {
      if (target && Number.isFinite(px)) designModeBridge.setInset(target, ids, axis, px);
    },
    [target, tab.selection],
  );

  const onAbsolute = useCallback(
    (on: boolean) => {
      if (target) designModeBridge.setAbsolute(target, ids, on);
    },
    [target, tab.selection],
  );

  const onAspectLock = useCallback(
    (on: boolean) => {
      if (target) designModeBridge.setAspectLock(target, ids, on);
    },
    [target, tab.selection],
  );

  // Per-field mixed/changed state plus its revert — one helper the sections spread onto
  // every field (`{...field("width")}`), so a new field can't quietly skip either.
  const field = useCallback(
    (...args: Parameters<FieldStateFor>) =>
      fieldStateFor(tab.selection, (properties) => {
        if (target) designModeBridge.revertDraft(target, ids, properties);
      })(...args),
    [target, tab.selection],
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

  if (!runtimeTabId || !tab.enabled) return null;

  const sectionProps = {
    selection: tab.selection,
    apply,
    spacingBase: tab.tokens?.spacingBasePx ?? null,
    field,
  };

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

      <CanvasControls
        runtimeTabId={runtimeTabId}
        threadRef={threadRef}
        tabId={tabId}
        canvas={tab.canvas}
      />

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
            {...sectionProps}
            onSizeMode={setSizeMode}
            onAspectLock={onAspectLock}
          />
          <MarginSection element={first} {...sectionProps} />
          <AppearanceSection element={first} {...sectionProps} />
          <TypographySection element={first} {...sectionProps} tokens={tab.tokens} />
          <FillSection element={first} {...sectionProps} tokens={tab.tokens} />
          <StrokeSection element={first} {...sectionProps} tokens={tab.tokens} />
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
