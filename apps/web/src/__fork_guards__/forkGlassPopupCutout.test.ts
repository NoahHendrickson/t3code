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
  it("follows the vibrancy marker, not the palette choice or a stale answer", () => {
    // A superseded vibrancy sync resolves with its own result; only the
    // marker reflects the newest one (forkCoolDarkerSidebarVibrancy guard).
    expect(forkTheme).toMatch(
      /const glassOn = isForkSidebarVibrancyApplied\(\);[\s\S]{0,120}?syncForkGlassPopupCutout\(glassOn\);/u,
    );
  });

  it("keeps a running cutout when a palette sync leaves glass on", () => {
    expect(cutout).toContain("if (glassOn === (stop !== null)) return;");
  });

  it("clears portals opened beneath a popup, not only the app root", () => {
    // A menu over the Usage panel, a select inside a dialog: the lower
    // portal is outside #root and would otherwise show through the tint.
    expect(cutout).toMatch(/hole\.layer > layer/u);
    expect(cutout).toContain('"mask-clip", "no-clip"');
  });

  it("masks the app root that the popups portal outside of", () => {
    expect(cutout).toContain('document.getElementById("root")');
    expect(indexHtml).toMatch(/<div id="root">/u);
    expect(cutout).toContain("next.set(appRoot, holes);");
  });

  it("is registered in the manifest", () => {
    expect(customizations).toContain("- id: fork-glass-popup-cutout");
  });
});
