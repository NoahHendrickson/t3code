// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-glass-preview-parking`.
 *
 * Under Cool Darker glass the app is translucent, so a preview guest parked
 * "behind the app" is on screen. Only recording and picture-in-picture may
 * park a guest inside the viewport; automation-only activity parks offscreen,
 * paintable. A sync that takes upstream's HostedBrowserWebview wholesale
 * re-introduces the flash of a background thread's page through the chat.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  HIDDEN_BROWSER_WEBVIEW_OFFSET,
  resolveHostedBrowserWebviewWrapperStyle,
} from "../browser/hostedBrowserWebviewStyle";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const host = readSibling("../browser/HostedBrowserWebview.tsx");

describe("fork-glass-preview-parking", () => {
  it("hands the resolver only frame consumers as rendering-active", () => {
    expect(host).toContain("fork:begin fork-glass-preview-parking");
    expect(host).toContain("const captureActive = pictureInPicture || recordingActive;");
    expect(host).toContain("renderingActive: active || captureActive,");
    // Automation must still find the guest paintable offscreen on every
    // platform, not only macOS.
    expect(host).toContain(
      "keepPaintableWhenInactive: isMacPlatform(navigator.platform) || backgroundActivity,",
    );
    // The attribute automation polls keeps the full set, so a background guest
    // still reports as rendering while it is parked offscreen.
    expect(host).toContain(
      "const renderingActive = active || backgroundActivity || pictureInPicture || recordingActive;",
    );
    expect(host).toContain('data-preview-rendering={renderingActive ? "active" : "suspended"}');
  });

  it("parks an automation-only guest offscreen and paintable", () => {
    // What the fenced call site now hands the resolver for a guest whose only
    // consumer is background activity: not rendering-active, but paintable.
    const style = resolveHostedBrowserWebviewWrapperStyle({
      active: false,
      renderingActive: false,
      keepPaintableWhenInactive: true,
      rect: { x: 12, y: 34, width: 800, height: 600 },
      hiddenSize: { width: 1280, height: 800 },
    });
    expect(style.left).toBe(HIDDEN_BROWSER_WEBVIEW_OFFSET);
    expect(style.top).toBe(HIDDEN_BROWSER_WEBVIEW_OFFSET);
    expect(style.visibility).toBe("visible");
    expect(style.zIndex).toBe(-1);
  });
});
