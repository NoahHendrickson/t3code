"use client";

import type { ScopedThreadRef } from "@t3tools/contracts";

import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import { PreviewPanelShell, type PreviewPanelMode } from "~/components/preview/PreviewPanelShell";
import { PreviewView } from "~/components/preview/PreviewView";
import { ForkLayersTree } from "~/custom/designMode/ForkLayersTree";
import { ForkDesignPanel } from "~/custom/designMode/panel/ForkDesignPanel";
import { isPreviewSupportedInRuntime, useThreadPreviewState } from "~/previewStateStore";

interface Props {
  mode: PreviewPanelMode;
  threadRef: ScopedThreadRef;
  tabId?: string | null;
  configuredUrls?: ReadonlyArray<string> | undefined;
  visible: boolean;
}

/** Fork override: docks the native design panel beside the untouched preview surface. */
export function PreviewPanel({ mode, threadRef, tabId, configuredUrls, visible }: Props) {
  const previewState = useThreadPreviewState(threadRef);
  const activeTabId = tabId ?? previewState.activeTabId;
  const runtimeTabId = activeTabId
    ? previewRuntimeTabId(threadRef, previewState.serverEpoch, activeTabId)
    : null;
  if (!isPreviewSupportedInRuntime()) {
    return (
      <PreviewPanelShell mode={mode}>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            Preview is only available in the T3 Code desktop app.
          </p>
        </div>
      </PreviewPanelShell>
    );
  }

  return (
    <PreviewPanelShell mode={mode}>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ForkLayersTree runtimeTabId={runtimeTabId} />
        <PreviewView
          threadRef={threadRef}
          {...(tabId !== undefined ? { tabId } : {})}
          configuredUrls={configuredUrls}
          visible={visible}
        />
        <ForkDesignPanel runtimeTabId={runtimeTabId} threadRef={threadRef} tabId={activeTabId} />
      </div>
    </PreviewPanelShell>
  );
}
