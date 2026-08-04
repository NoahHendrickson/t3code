import { DESIGN_MODE_GLOBAL, type DesignChangeRequestPayload } from "./protocol";

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
  applyDraft(runtimeTabId: string, ids: readonly number[], property: string, value: string): void {
    fire(runtimeTabId, "applyDraft", [ids, property, value]);
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
    if (typeof result !== "object" || result === null) return null;
    const { markdown, elementCount, elements } = result as {
      markdown?: unknown;
      elementCount?: unknown;
      elements?: unknown;
    };
    return typeof markdown === "string" &&
      typeof elementCount === "number" &&
      Array.isArray(elements)
      ? ({ markdown, elementCount, elements } as DesignChangeRequestPayload)
      : null;
  },
  destroy(runtimeTabId: string): void {
    fire(runtimeTabId, "destroy", []);
  },
};
