// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#fork-glass-popup-cutout`.
 *
 * The Glass popups paint a translucent tint that only reads as glass because
 * the cutout clears the page from under them. A sync that drops the call, or
 * renames the element the mask lands on, leaves everything compiling and the
 * popups showing the rows straight through. The popup rule's arms and the
 * script's selector are pinned together in forkPopupSurface.test.ts.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const forkTheme = readSibling("../custom/forkTheme.ts");
const cutout = readSibling("../custom/forkGlassPopupCutout.ts");
const indexHtml = readSibling("../../index.html");
const customizations = readSibling("../../../../.fork/customizations.yaml");

describe("fork guard: fork-glass-popup-cutout", () => {
  it("starts on the vibrancy answer, not on the palette choice", () => {
    expect(forkTheme).toMatch(
      /syncForkSidebarVibrancy\(activePalette === COOL_DARKER_THEME\)\s*\.then\(\(applied\) => \{\s*syncForkGlassPopupCutout\(applied\);/u,
    );
  });

  it("masks the app root that the popups portal outside of", () => {
    expect(cutout).toContain('document.getElementById("root")');
    expect(indexHtml).toMatch(/<div id="root">/u);
    expect(cutout).toContain('appRoot.style.setProperty("mask-image", mask)');
  });

  it("is registered in the manifest", () => {
    expect(customizations).toContain("- id: fork-glass-popup-cutout");
  });
});
