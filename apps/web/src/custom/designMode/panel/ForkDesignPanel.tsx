import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";

import { useDesignChangeDraftStore } from "../designChangeDraftStore";
import { designModeBridge } from "../designModeBridge";
import { selectDesignModeTab, useDesignModeStore } from "../designModeStore";
import type { DesignModeStyleKey } from "../protocol";
import { ColorField, PanelSection, ScrubField } from "./DesignPanelFields";

const FONT_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"] as const;

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
    (property: DesignModeStyleKey, value: string) => {
      if (!runtimeTabId || ids.length === 0) return;
      designModeBridge.applyDraft(runtimeTabId, ids, property, value);
    },
    // ids is rebuilt per render but changes only with the selection snapshot array.
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

  const onSend = useCallback(async () => {
    if (!runtimeTabId) return;
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
  }, [runtimeTabId, threadRef]);

  if (!runtimeTabId || !tab.enabled) return null;

  return (
    <div
      className="flex w-60 shrink-0 flex-col border-l border-border bg-background"
      data-fork-design-panel
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        {first ? (
          <>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {first.tag}
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {tab.selection.length > 1
                ? `${tab.selection.length} selected`
                : (first.sourceLabel ?? "untagged")}
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
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3"
        >
          <PanelSection title="Size" className="grid-cols-2">
            <ScrubField
              label="W"
              title="Width"
              value={first.styles.width}
              min={0}
              onEdit={(v) => apply("width", v)}
            />
            <ScrubField
              label="H"
              title="Height"
              value={first.styles.height}
              min={0}
              onEdit={(v) => apply("height", v)}
            />
          </PanelSection>

          <PanelSection title="Padding" className="grid-cols-2">
            <ScrubField
              label="T"
              title="Padding top"
              value={first.styles["padding-top"]}
              min={0}
              onEdit={(v) => apply("padding-top", v)}
            />
            <ScrubField
              label="R"
              title="Padding right"
              value={first.styles["padding-right"]}
              min={0}
              onEdit={(v) => apply("padding-right", v)}
            />
            <ScrubField
              label="B"
              title="Padding bottom"
              value={first.styles["padding-bottom"]}
              min={0}
              onEdit={(v) => apply("padding-bottom", v)}
            />
            <ScrubField
              label="L"
              title="Padding left"
              value={first.styles["padding-left"]}
              min={0}
              onEdit={(v) => apply("padding-left", v)}
            />
          </PanelSection>

          <PanelSection title="Margin" className="grid-cols-2">
            <ScrubField
              label="T"
              title="Margin top"
              value={first.styles["margin-top"]}
              onEdit={(v) => apply("margin-top", v)}
            />
            <ScrubField
              label="R"
              title="Margin right"
              value={first.styles["margin-right"]}
              onEdit={(v) => apply("margin-right", v)}
            />
            <ScrubField
              label="B"
              title="Margin bottom"
              value={first.styles["margin-bottom"]}
              onEdit={(v) => apply("margin-bottom", v)}
            />
            <ScrubField
              label="L"
              title="Margin left"
              value={first.styles["margin-left"]}
              onEdit={(v) => apply("margin-left", v)}
            />
          </PanelSection>

          <PanelSection title="Radius">
            <ScrubField
              label="R"
              title="Corner radius"
              value={first.styles["border-radius"]}
              min={0}
              onEdit={(v) => apply("border-radius", v)}
            />
          </PanelSection>

          <PanelSection title="Typography" className="grid-cols-2">
            <ScrubField
              label="Sz"
              title="Font size"
              value={first.styles["font-size"]}
              min={1}
              onEdit={(v) => apply("font-size", v)}
            />
            <label className="flex h-6 items-center gap-1 rounded bg-muted/40" title="Font weight">
              <span className="w-7 shrink-0 select-none ps-1.5 text-[10px] font-medium text-muted-foreground">
                Wt
              </span>
              <select
                defaultValue={first.styles["font-weight"]}
                onChange={(event) => apply("font-weight", event.target.value)}
                className="h-full w-full min-w-0 appearance-none bg-transparent pe-1.5 text-xs text-foreground outline-none"
              >
                {FONT_WEIGHTS.map((weight) => (
                  <option key={weight} value={weight}>
                    {weight}
                  </option>
                ))}
              </select>
            </label>
            <ScrubField
              label="Lh"
              title="Line height"
              value={first.styles["line-height"]}
              min={0}
              onEdit={(v) => apply("line-height", v)}
            />
            <ColorField
              label="C"
              title="Text color"
              value={first.styles.color}
              onEdit={(v) => apply("color", v)}
            />
          </PanelSection>

          <PanelSection title="Fill" className="grid-cols-1">
            <ColorField
              label="Bg"
              title="Background color"
              value={first.styles["background-color"]}
              onEdit={(v) => apply("background-color", v)}
            />
            <ScrubField
              label="Op"
              title="Opacity"
              value={first.styles.opacity}
              unit="none"
              min={0}
              max={1}
              step={0.01}
              precision={2}
              onEdit={(v) => apply("opacity", v)}
            />
          </PanelSection>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center px-4 text-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {tab.tagged === false
              ? "This app isn't tagged for Design mode — ask the agent to set up forge-mode's dev plugin."
              : "Click an element in the preview to edit it. Shift-click adds to the selection; double-click edits text."}
          </p>
        </div>
      )}

      <footer className="shrink-0 space-y-1.5 border-t border-border px-3 py-2">
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
          disabled={tab.draftCount === 0}
          type="button"
          data-fork-design-panel-send
        >
          Send to chat
        </Button>
      </footer>
    </div>
  );
}
