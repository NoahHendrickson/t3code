// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#sidebar-v2-error-tooltip`.
 *
 * Upstream's tooltip restyle replaced the session's real last error with the
 * literal "Error occurred". The fork restores the message; this asserts a
 * sync cannot quietly take upstream's literal back, which would render fine
 * and pass every other test while removing the sidebar's only diagnostic.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const sidebarV2 = NodeFS.readFileSync(
  NodeURL.fileURLToPath(new URL("../components/SidebarV2.tsx", import.meta.url)),
  "utf8",
);

describe("fork guard: sidebar-v2-error-tooltip", () => {
  it("renders the session's actual last error in the thread tooltip", () => {
    expect(sidebarV2).toContain("{thread.session.lastError}");
    // The literal upstream substituted; bounded to a JSX text position so
    // prose in a comment cannot trip it.
    expect(sidebarV2).not.toMatch(/>\s*Error occurred\s*</u);
  });

  it("lets the message wrap instead of truncating it", () => {
    // A truncated error hides the tail — exit codes and paths — which is the
    // half that diagnoses anything. Scoped to the element carrying the
    // message rather than the file, so other truncate uses stay free.
    const start = sidebarV2.indexOf("{thread.session.lastError}");
    expect(start).toBeGreaterThanOrEqual(0);
    const elementOpen = sidebarV2.lastIndexOf("<div", start);
    const element = sidebarV2.slice(elementOpen, start);
    expect(element).toContain("wrap-break-word");
    expect(element).not.toContain("truncate");
  });
});
