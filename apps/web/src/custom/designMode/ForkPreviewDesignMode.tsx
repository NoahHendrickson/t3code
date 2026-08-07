import { PaintbrushIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";

import { parseDesignModeConsoleMessage } from "./protocol";
import { designModeBridge, findPreviewWebview } from "./designModeBridge";
import { designUndoHistory } from "./designUndoHistory";
import { selectDesignModeTab, useDesignModeStore } from "./designModeStore";

interface Props {
  runtimeTabId: string | null;
  disabled: boolean;
}

/**
 * The fork's Design-mode toggle for the preview chrome row, plus the host side of the
 * guest bridge: injects the bundled headless engine into the guest page, re-injects after
 * navigations, and projects the engine's console-message stream (ready/state/selection/
 * drafts) into designModeStore for the native panel (panel/ForkDesignPanel.tsx) to render.
 * Mounted from PreviewView's `trailingActions` fence — see
 * `.fork/customizations.yaml#fork-design-mode`.
 */
export function ForkPreviewDesignMode({ runtimeTabId, disabled }: Props) {
  // Only `enabled` — this button re-rendered on every selection, layers and canvas message
  // otherwise (up to ~4Hz while an agent edits the previewed page) to draw the same icon.
  const enabled = useDesignModeStore(
    (state) => selectDesignModeTab(state.byTabId, runtimeTabId).enabled,
  );
  const enabledRef = useRef(false);
  enabledRef.current = enabled;

  const injectEngine = useCallback(async (tabId: string) => {
    const webview = findPreviewWebview(tabId);
    if (!webview) throw new Error("Preview webview not found");
    // The incoming engine mints a fresh id registry, so every entry the history holds names
    // an id that is about to mean nothing. Cleared here rather than at each call site so a
    // future injection path cannot forget it.
    designUndoHistory.clear(tabId);
    const { default: engineCode } = await import("virtual:fork-design-mode-engine");
    await webview.executeJavaScript(engineCode, false);
  }, []);

  /**
   * Brings the guest back in line with what this tab's store says.
   *
   * The bridge attaches on mount, but injection only ever happened on the toggle and on
   * `dom-ready` — and this component unmounts whenever the right panel shows a terminal or a
   * diff, or the user switches threads. A full page reload in that window (exactly what a
   * non-HMR-able agent edit causes, i.e. the feature's own loop) wiped the guest's globals
   * with nobody listening for `dom-ready`, and the panel came back reporting Design mode on
   * over a page with no engine: commands vanished into `fire`'s catch and Send answered "no
   * changes" while the drafts sat untouched in the guest's sessionStorage.
   *
   * A live same-version engine is left alone apart from `setActive(true)`, which is the
   * engine's own re-emit path (headlessMode's idempotent re-activation clears the selection
   * gate and pushes a fresh snapshot), so the panel re-syncs without transferring the bundle.
   */
  const reconcileEngine = useCallback(
    async (tabId: string) => {
      if (await designModeBridge.engineIsCurrent(tabId)) {
        designModeBridge.setActive(tabId, true);
        return;
      }
      await injectEngine(tabId);
    },
    [injectEngine],
  );

  // Bridge + re-injection listeners live on the webview element itself (it outlives this
  // component's mounts). Attached only while the chrome row is mounted for this tab.
  useEffect(() => {
    if (!runtimeTabId) return;
    const store = useDesignModeStore.getState();

    const onConsoleMessage = (event: Event) => {
      const line = (event as Event & { message?: unknown }).message;
      if (typeof line !== "string") return;
      const message = parseDesignModeConsoleMessage(line);
      if (!message) return;
      switch (message.type) {
        case "ready":
          // Selection works in every mode — selector-only pages just get a soft note in
          // the panel's empty state instead of a warning toast (they remain editable).
          store.setSourceMode(runtimeTabId, message.sourceMode);
          return;
        case "state":
          store.setEnabled(runtimeTabId, message.active);
          return;
        case "selection":
          store.setSelection(runtimeTabId, message.elements);
          return;
        case "drafts":
          store.setDraftCount(runtimeTabId, message.count);
          return;
        case "tokens":
          store.setTokens(runtimeTabId, {
            colors: message.colors,
            spacingBasePx: message.spacingBasePx,
          });
          return;
        case "layers":
          store.setLayers(runtimeTabId, {
            roots: message.roots,
            truncated: message.truncated,
          });
          return;
        case "canvas":
          store.setCanvas(runtimeTabId, { on: message.on, scalePercent: message.scalePercent });
          return;
        default: {
          // Exhaustiveness: a new DesignModeEngineMessage variant must fail to compile
          // here instead of being silently dropped.
          const _exhaustive: never = message;
          return _exhaustive;
        }
      }
    };

    // A navigation (or dev-server full reload) wipes the guest's globals — put the engine
    // back whenever design mode is meant to be on for this tab. The undo history dies with
    // the old document whether or not we re-inject (its entries name ids from the previous
    // injection's registry), which is why the clear here is unconditional and not left to
    // injectEngine's own.
    const onDomReady = () => {
      designUndoHistory.clear(runtimeTabId);
      if (!enabledRef.current) return;
      void injectEngine(runtimeTabId).catch(() => undefined);
    };

    // The webview mounts in ElectronBrowserHost's tree, not this one, so it can appear
    // after the chrome row does (fresh tab, thread switch). Retry briefly instead of
    // silently never attaching — same 50ms readiness idiom as the upstream automation
    // host's polls; ~5s covers registration without leaving a long-lived timer.
    let webview: ReturnType<typeof findPreviewWebview> = null;
    let retryTimer: number | null = null;
    let attempts = 0;
    const attach = () => {
      retryTimer = null;
      webview = findPreviewWebview(runtimeTabId);
      if (!webview) {
        if (attempts < 100) {
          attempts += 1;
          retryTimer = window.setTimeout(attach, 50);
        }
        return;
      }
      webview.addEventListener("console-message", onConsoleMessage);
      webview.addEventListener("dom-ready", onDomReady);
      // The listeners alone do not make the guest agree with us — see reconcileEngine.
      if (enabledRef.current) void reconcileEngine(runtimeTabId).catch(() => undefined);
    };
    attach();
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (webview) {
        webview.removeEventListener("console-message", onConsoleMessage);
        webview.removeEventListener("dom-ready", onDomReady);
      }
    };
  }, [injectEngine, reconcileEngine, runtimeTabId]);

  const handleToggle = useCallback(() => {
    if (!runtimeTabId) return;
    const store = useDesignModeStore.getState();
    if (enabledRef.current) {
      // Destroy (not just deactivate): drafts persist in the guest's sessionStorage — with
      // their originals, so the next injection restores them faithfully rather than
      // capturing the previews this teardown leaves painted (lifecycle-store.ts's `props`).
      // The undo history does NOT survive the id registry it names — clear it.
      designUndoHistory.clear(runtimeTabId);
      designModeBridge.destroy(runtimeTabId);
      store.setEnabled(runtimeTabId, false);
      return;
    }
    void injectEngine(runtimeTabId).then(
      () => store.setEnabled(runtimeTabId, true),
      (error: unknown) => {
        toastManager.add({
          type: "error",
          title: "Unable to start Design mode",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      },
    );
  }, [injectEngine, runtimeTabId]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={enabled ? "secondary" : "ghost"}
            size="icon-xs"
            onClick={handleToggle}
            disabled={disabled}
            aria-label={enabled ? "Exit design mode" : "Design mode"}
            aria-pressed={enabled ? "true" : "false"}
            type="button"
            data-fork-design-mode-toggle
          />
        }
      >
        <PaintbrushIcon className={cn(enabled && "text-primary")} />
      </TooltipTrigger>
      <TooltipPopup>
        {disabled
          ? "Design mode needs a loaded page"
          : enabled
            ? "Exit design mode"
            : "Design mode — click elements to edit, send changes to the agent"}
      </TooltipPopup>
    </Tooltip>
  );
}
