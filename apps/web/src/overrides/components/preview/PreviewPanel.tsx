"use client";

import {
  AuthPreviewOperateScope,
  type PreviewAnnotationPayload,
  type ScopedThreadRef,
} from "@t3tools/contracts";

import type { ComposerImageAttachment } from "~/composerDraftStore";

import { usePreviewAvailable } from "~/browser/previewRuntime";
import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import { PreviewPanelShell, type PreviewPanelMode } from "~/components/preview/PreviewPanelShell";
import { PreviewView } from "~/components/preview/PreviewView";
import { ForkLayersTree } from "~/custom/designMode/ForkLayersTree";
import { ForkDesignPanel } from "~/custom/designMode/panel/ForkDesignPanel";
import { useThreadPreviewState } from "~/previewStateStore";
import { useEnvironmentScope } from "~/state/session";

interface Props {
  mode: PreviewPanelMode;
  threadRef: ScopedThreadRef;
  tabId?: string | null;
  configuredUrls?: ReadonlyArray<string> | undefined;
  visible: boolean;
  onSendAnnotation?: (
    annotation: PreviewAnnotationPayload,
    image: ComposerImageAttachment | null,
  ) => void;
}

/** Fork override: docks the native design panel beside the untouched preview surface. */
export function PreviewPanel({
  mode,
  threadRef,
  tabId,
  configuredUrls,
  visible,
  onSendAnnotation,
}: Props) {
  const previewState = useThreadPreviewState(threadRef);
  const activeTabId = tabId ?? previewState.activeTabId;
  const runtimeTabId = activeTabId
    ? previewRuntimeTabId(threadRef, previewState.serverEpoch, activeTabId)
    : null;
  const available = usePreviewAvailable(threadRef.environmentId);
  const canOperatePreview = useEnvironmentScope(threadRef.environmentId, AuthPreviewOperateScope);
  if (!canOperatePreview || !available) {
    return (
      <PreviewPanelShell mode={mode}>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            {canOperatePreview
              ? "Preview is only available in the T3 Code desktop app."
              : "Pair this client again with preview access to control browser previews."}
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
          {...(onSendAnnotation ? { onSendAnnotation } : {})}
        />
        <ForkDesignPanel runtimeTabId={runtimeTabId} threadRef={threadRef} tabId={activeTabId} />
      </div>
    </PreviewPanelShell>
  );
}
