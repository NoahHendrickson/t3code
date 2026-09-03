// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#fork-glass-preview-parking`.
 *
 * Under Cool Darker glass the app is translucent, so a preview guest parked
 * "behind the app" is on screen. The parked wrapper is hidden with opacity and
 * nothing else: measured on Electron 43, a guest under `opacity: 0` inside the
 * viewport keeps producing fresh frames for capturePage, while a guest parked
 * fully offscreen or under `visibility: hidden` makes capturePage hang. The
 * placement is upstream's; the fork only stops the parked wrapper painting.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { resolveHostedBrowserWebviewWrapperStyle } from "../browser/hostedBrowserWebviewStyle";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const MARKER = `:root[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;
const host = readSibling("../browser/HostedBrowserWebview.tsx");
const theme = readSibling("../theme.custom.css");

describe("fork-glass-preview-parking", () => {
  it("marks a rendering-active guest that is not on screen as parked", () => {
    expect(host).toContain("fork:begin fork-glass-preview-parking");
    expect(host).toContain(
      'data-fork-preview-parked={renderingActive && !active ? "true" : undefined}',
    );
    // The placement is upstream's, untouched: the full rendering-active set is
    // what the resolver parks in-viewport, so recording, picture-in-picture
    // AND automation snapshots all keep a composited guest.
    expect(host).toContain(
      "const renderingActive = active || backgroundActivity || pictureInPicture || recordingActive;",
    );
    expect(host).toContain("    renderingActive,\n");
    expect(host).not.toContain("captureActive");
  });

  it("hides the parked wrapper with opacity alone", () => {
    const rule = cssRules(theme).find(
      (candidate) =>
        candidate.selector.includes('[data-fork-preview-parked="true"]') &&
        candidate.selector.includes(MARKER),
    );
    expect(rule).toBeDefined();
    expect(rule?.selector).toContain("[data-preview-viewport]");
    expect(rule?.body).toMatch(/opacity:\s*0\b/u);
    // Either of these stops the guest compositing, which is the exact failure
    // the opacity approach exists to avoid.
    expect(rule?.body).not.toContain("visibility");
    expect(rule?.body).not.toContain("display");
  });

  it("relies on upstream parking a background guest inside the viewport", () => {
    // A sync that moves the park offscreen breaks background snapshots; this
    // pins the placement the opacity rule assumes.
    const style = resolveHostedBrowserWebviewWrapperStyle({
      active: false,
      renderingActive: true,
      rect: { x: 12, y: 34, width: 800, height: 600 },
      hiddenSize: { width: 1280, height: 800 },
    });
    expect(style).toMatchObject({ left: 0, top: 0, zIndex: -1, visibility: "visible" });
  });
});
