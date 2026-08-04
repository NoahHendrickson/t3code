import { PencilRulerIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { useComposerHandleContext } from "~/composerHandleContext";

import { parseDesignModeConsoleMessage } from "./protocol";
import { designModeBridge, findPreviewWebview } from "./designModeBridge";
import { selectDesignModeTab, useDesignModeStore } from "./designModeStore";

/** Sent to the thread when the previewed app has no `data-dc-source` tags — setting up the
 * tagging transform is itself a task for the agent (the Forge's SETUP.md is written for one). */
const FORGE_SETUP_PROMPT =
  "Set up forge-mode's dev-only JSX tagging in this project so T3 Code's Design mode can " +
  "map clicked elements to source. Follow the plugin-wiring steps in " +
  "https://github.com/NoahHendrickson/the-forge/blob/main/SETUP.md (`npx forge-mode init` " +
  "does most of it). Only the Vite/Next plugin matters here — skip mounting " +
  "<ForgeDesignMode /> and every MCP/agent-delivery step; T3 Code provides the design " +
  "panel and delivery itself.";

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
  const tabState = useDesignModeStore((state) => selectDesignModeTab(state.byTabId, runtimeTabId));
  const composerHandleRef = useComposerHandleContext();
  const enabledRef = useRef(false);
  enabledRef.current = tabState.enabled;

  const injectEngine = useCallback(async (tabId: string) => {
    const webview = findPreviewWebview(tabId);
    if (!webview) throw new Error("Preview webview not found");
    const { default: engineCode } = await import("virtual:fork-design-mode-engine");
    await webview.executeJavaScript(engineCode, false);
  }, []);

  const insertSetupPrompt = useCallback(() => {
    // No focusAtEnd after insert — a synchronous focus makes the still-stale editor echo
    // its pre-insert content over the store (see ForkDesignPanel's onSend comment).
    composerHandleRef?.current?.insertTextAtEnd(FORGE_SETUP_PROMPT, {
      ensureLeadingBoundary: true,
    });
  }, [composerHandleRef]);

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
          store.setTagged(runtimeTabId, message.tagged);
          if (!message.tagged) {
            toastManager.add({
              type: "warning",
              title: "This app isn't tagged for Design mode",
              description:
                "Selection needs forge-mode's dev plugin in the previewed project. " +
                "Ask the agent to set up tagging to edit elements.",
              actionProps: { children: "Ask agent", onClick: insertSetupPrompt },
            });
          }
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
      }
    };

    // A navigation (or dev-server full reload) wipes the guest's globals — put the engine
    // back whenever design mode is meant to be on for this tab.
    const onDomReady = () => {
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
    };
    attach();
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (webview) {
        webview.removeEventListener("console-message", onConsoleMessage);
        webview.removeEventListener("dom-ready", onDomReady);
      }
    };
  }, [injectEngine, insertSetupPrompt, runtimeTabId]);

  const handleToggle = useCallback(() => {
    if (!runtimeTabId) return;
    const store = useDesignModeStore.getState();
    if (enabledRef.current) {
      // Destroy (not just deactivate): drafts persist in the guest's sessionStorage and
      // are restored on the next injection, so tearing the overlay down loses nothing.
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
            variant={tabState.enabled ? "secondary" : "ghost"}
            size="icon-xs"
            onClick={handleToggle}
            disabled={disabled}
            aria-label={tabState.enabled ? "Exit design mode" : "Design mode"}
            aria-pressed={tabState.enabled ? "true" : "false"}
            type="button"
            data-fork-design-mode-toggle
          />
        }
      >
        <PencilRulerIcon className={cn(tabState.enabled && "text-primary")} />
      </TooltipTrigger>
      <TooltipPopup>
        {disabled
          ? "Design mode needs a loaded page"
          : tabState.enabled
            ? "Exit design mode"
            : "Design mode — click elements to edit, send changes to the agent"}
      </TooltipPopup>
    </Tooltip>
  );
}
