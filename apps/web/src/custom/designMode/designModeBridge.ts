import {
  DESIGN_MODE_GLOBAL,
  parseDesignChangeRequestPayload,
  type DesignChangeRequestPayload,
  type DesignModeAlignAxis,
  type DesignModeAlignValue,
  type DesignModeCanvasCommand,
  type DesignModeSelectMode,
  type DesignModeSizeMode,
  type DesignModeWritableKey,
} from "./protocol";

/** The subset of Electron's webview element the design-mode host drives. Same shape the
 * upstream automation host declares locally (PreviewAutomationHosts.tsx). */
export interface DesignModeWebview extends Element {
  readonly executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
}

export const findPreviewWebview = (runtimeTabId: string): DesignModeWebview | null =>
  Array.from(document.querySelectorAll<DesignModeWebview>("webview[data-preview-tab]")).find(
    (candidate) => candidate.getAttribute("data-preview-tab") === runtimeTabId,
  ) ?? null;

/** Builds the executeJavaScript expression for one guest-handle call. Arguments are
 * JSON-encoded — the whole command surface is JSON-serializable by contract
 * (protocol.ts `DesignModeGuestHandle`). */
const handleCall = (member: string, args: readonly unknown[]): string =>
  `globalThis.${DESIGN_MODE_GLOBAL}?.${member}(${args.map((a) => JSON.stringify(a)).join(",")})`;

const fire = (runtimeTabId: string, member: string, args: readonly unknown[]): void => {
  const webview = findPreviewWebview(runtimeTabId);
  void webview?.executeJavaScript(handleCall(member, args), false).catch(() => undefined);
};

/**
 * Host → guest command surface. Everything except `buildSend` is fire-and-forget: draft
 * writes are latency-tolerant (the guest coalesces repaints to rAF) and a lost call is
 * self-healing on the next edit. `buildSend`'s return value rides the executeJavaScript
 * promise back.
 */
export const designModeBridge = {
  setActive(runtimeTabId: string, on: boolean): void {
    fire(runtimeTabId, "setActive", [on]);
  },
  applyDraft(
    runtimeTabId: string,
    ids: readonly number[],
    property: DesignModeWritableKey,
    value: string,
  ): void {
    fire(runtimeTabId, "applyDraft", [ids, property, value]);
  },
  setSizeMode(
    runtimeTabId: string,
    ids: readonly number[],
    axis: "width" | "height",
    mode: DesignModeSizeMode,
  ): void {
    fire(runtimeTabId, "setSizeMode", [ids, axis, mode]);
  },
  setAbsolute(runtimeTabId: string, ids: readonly number[], on: boolean): void {
    fire(runtimeTabId, "setAbsolute", [ids, on]);
  },
  setInset(runtimeTabId: string, ids: readonly number[], axis: "x" | "y", px: number): void {
    fire(runtimeTabId, "setInset", [ids, axis, px]);
  },
  alignSelection(
    runtimeTabId: string,
    ids: readonly number[],
    axis: DesignModeAlignAxis,
    value: DesignModeAlignValue,
  ): void {
    fire(runtimeTabId, "alignSelection", [ids, axis, value]);
  },
  setAspectLock(runtimeTabId: string, ids: readonly number[], on: boolean): void {
    fire(runtimeTabId, "setAspectLock", [ids, on]);
  },
  revertDraft(runtimeTabId: string, ids: readonly number[], properties: readonly string[]): void {
    fire(runtimeTabId, "revertDraft", [ids, properties]);
  },
  discardAll(runtimeTabId: string): void {
    fire(runtimeTabId, "discardAll", []);
  },
  compareAll(runtimeTabId: string, on: boolean): void {
    fire(runtimeTabId, "compareAll", [on]);
  },
  async buildSend(runtimeTabId: string): Promise<DesignChangeRequestPayload | null> {
    const webview = findPreviewWebview(runtimeTabId);
    if (!webview) return null;
    const result = await webview
      .executeJavaScript(handleCall("buildSend", []), false)
      .catch(() => null);
    return parseDesignChangeRequestPayload(result);
  },
  selectElement(runtimeTabId: string, id: number, mode: DesignModeSelectMode = "replace"): void {
    fire(runtimeTabId, "selectElement", [id, mode]);
  },
  hoverElement(runtimeTabId: string, id: number | null): void {
    fire(runtimeTabId, "hoverElement", [id]);
  },
  reorderElement(runtimeTabId: string, id: number, beforeId: number | null): void {
    fire(runtimeTabId, "reorderElement", [id, beforeId]);
  },
  setCanvas(runtimeTabId: string, on: boolean): void {
    fire(runtimeTabId, "setCanvas", [on]);
  },
  canvasCommand(runtimeTabId: string, action: DesignModeCanvasCommand): void {
    fire(runtimeTabId, "canvasCommand", [action]);
  },
  destroy(runtimeTabId: string): void {
    fire(runtimeTabId, "destroy", []);
  },
};
